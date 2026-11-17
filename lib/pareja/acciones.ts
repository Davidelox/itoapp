import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';

import type { ColorPersona } from '@/constants/theme';
import { esErrorDeRed, type Resultado } from '@/lib/auth/errores';
import { hoyISO } from '@/lib/gastos/fechas';
import { normalizarCodigo } from '@/lib/pareja/codigo';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

type Error23505 = { code?: string };
const esUnica = (e: unknown) => (e as Error23505 | null)?.code === '23505';

const SIN_CONEXION = 'No hay conexión. Inténtalo de nuevo.';

const ERRORES_UNIRSE: Record<string, string> = {
  invalid_code: 'Ese código no existe. Revísalo con tu pareja.',
  code_used: 'Ese código ya se ha usado. Pide a tu pareja uno nuevo.',
  code_expired: 'Ese código ha caducado. Pide a tu pareja uno nuevo.',
  couple_full: 'Ese espacio ya está completo.',
  too_many_attempts: 'Has probado demasiados códigos. Vuelve a intentarlo dentro de una hora.',
};

/** Crea el espacio (create_couple). Un doble toque provoca 23505: se trata como éxito. */
export async function crearEspacio(): Promise<Resultado> {
  const { data, error } = await supabase.rpc('create_couple');
  if (!error && typeof data === 'string') guardarZonaDelMovil(data);
  if (!error || esUnica(error) || (error as { code?: string }).code === 'TW002') return { ok: true };
  registrarError('crearEspacio', error);
  return {
    ok: false,
    mensaje: esErrorDeRed(error) ? SIN_CONEXION : 'No se ha podido crear vuestro espacio. Inténtalo de nuevo.',
  };
}

/**
 * La zona horaria del espacio (para «hoy», cobros y aportaciones) es la del móvil de quien lo crea
 * (docs/plan-ajustes.md, decisión 5). Sin bloquear: si falla o la zona no vale, se queda Europe/Madrid.
 */
function guardarZonaDelMovil(coupleId: string) {
  let zona: string | undefined;
  try {
    zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    zona = undefined;
  }
  if (!zona || zona === 'Europe/Madrid') return;
  supabase
    .from('couples')
    .update({ time_zone: zona })
    .eq('id', coupleId)
    .then(({ error }) => {
      if (error) registrarError('crearEspacio.zona', error);
    });
}

/**
 * Canjea un código. join_couple no lanza error con un código malo (para que el intento cuente):
 * aquí se convierte en rechazo para que el nudo se suelte.
 */
export async function unirse(codigo: string): Promise<Resultado & { yaEnPareja?: boolean }> {
  const { data, error } = await supabase.rpc('join_couple', { p_code: normalizarCodigo(codigo) });
  if (error) {
    registrarError('unirse', error);
    return { ok: false, mensaje: esErrorDeRed(error) ? SIN_CONEXION : 'No se ha podido unir. Inténtalo de nuevo.' };
  }
  const r = data as { ok: boolean; error?: string } | null;
  if (r?.ok) return { ok: true };
  if (r?.error === 'already_in_couple') return { ok: true, yaEnPareja: true };
  return { ok: false, mensaje: ERRORES_UNIRSE[r?.error ?? ''] ?? 'No se ha podido unir. Inténtalo de nuevo.' };
}

export type CodigoVigente = { codigo: string; caduca: Date; caducado: boolean };

/** Código de invitación vigente de mi espacio (sin usar ni anulado). null si no hay. */
export async function codigoVigente(): Promise<CodigoVigente | null> {
  const { data, error } = await supabase
    .from('couple_invitations')
    .select('code, expires_at')
    .is('used_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    registrarError('codigoVigente', error);
    throw error;
  }
  const fila = data?.[0];
  if (!fila) return null;
  const caduca = new Date(fila.expires_at);
  return { codigo: fila.code, caduca, caducado: caduca.getTime() < Date.now() };
}

export async function nuevoCodigo(): Promise<Resultado> {
  const { error } = await supabase.rpc('create_invitation');
  if (error) {
    registrarError('nuevoCodigo', error);
    return { ok: false, mensaje: esErrorDeRed(error) ? SIN_CONEXION : 'No se ha podido crear otro código.' };
  }
  return { ok: true };
}

/** Sale del espacio. Si queda vacío, el servidor lo borra. */
export async function salirDelEspacio(): Promise<Resultado> {
  const { error } = await supabase.rpc('leave_couple');
  if (error) {
    registrarError('salirDelEspacio', error);
    return { ok: false, mensaje: esErrorDeRed(error) ? SIN_CONEXION : 'No se ha podido salir. Inténtalo de nuevo.' };
  }
  return { ok: true };
}

export type FotoElegida = { uri: string };

/**
 * Prepara la foto: 512x512 y JPEG de calidad 0,8. Volver a codificar elimina el EXIF (incluida la
 * ubicación GPS), cosa que `exif: false` del selector no garantiza.
 */
async function prepararFoto(foto: FotoElegida): Promise<ArrayBuffer> {
  const contexto = ImageManipulator.ImageManipulator.manipulate(foto.uri);
  const imagen = await contexto.resize({ width: 512, height: 512 }).renderAsync();
  const resultado = await imagen.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.8 });
  const respuesta = await fetch(resultado.uri);
  return respuesta.arrayBuffer();
}

/**
 * Guarda el perfil, por orden: sube la foto, actualiza el nombre y la foto, y elige el color.
 * Si el color lo acaba de coger la otra persona (23505), se avisa y se vuelve a elegir.
 * La foto es opcional: si falla la subida se avisa (`codigo: 'foto_fallo'`) sin guardar nada y se puede seguir sin ella.
 */
export async function guardarPerfil(datos: {
  userId: string;
  nombre: string;
  color: ColorPersona;
  foto?: FotoElegida | null;
  avatarAnterior?: string | null;
  /** Ajustes → Editar perfil: quitar la foto actual (sin subir otra). */
  quitarFoto?: boolean;
}): Promise<Resultado> {
  let ruta: string | null | undefined;
  if (datos.foto) {
    try {
      const bytes = await prepararFoto(datos.foto);
      const nueva = `${datos.userId}/${Crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from('avatars')
        .upload(nueva, bytes, { contentType: 'image/jpeg', upsert: false });
      if (error) throw error;
      ruta = nueva;
    } catch (error) {
      registrarError('guardarPerfil.foto', error);
      return { ok: false, mensaje: 'No se ha podido subir la foto. Puedes seguir sin ella.', codigo: 'foto_fallo' };
    }
  }

  const cambios: { display_name: string; avatar_path?: string | null } = { display_name: datos.nombre.trim() };
  if (ruta) cambios.avatar_path = ruta;
  else if (datos.quitarFoto) cambios.avatar_path = null;
  const perfil = await supabase.from('profiles').update(cambios).eq('id', datos.userId);
  if (perfil.error) {
    registrarError('guardarPerfil.perfil', perfil.error);
    return { ok: false, mensaje: esErrorDeRed(perfil.error) ? SIN_CONEXION : 'No se ha podido guardar. Inténtalo de nuevo.' };
  }

  const miembro = await supabase.from('couple_members').update({ color: datos.color }).eq('user_id', datos.userId).is('left_at', null);
  if (miembro.error) {
    if (esUnica(miembro.error)) {
      return { ok: false, mensaje: 'Ese color lo acaba de elegir tu pareja. Elige otro.', codigo: 'color_ocupado' };
    }
    registrarError('guardarPerfil.color', miembro.error);
    return { ok: false, mensaje: esErrorDeRed(miembro.error) ? SIN_CONEXION : 'No se ha podido guardar. Inténtalo de nuevo.' };
  }

  if ((ruta || datos.quitarFoto) && datos.avatarAnterior) {
    // Sin bloquear: si falla, solo queda un archivo huérfano en la carpeta propia.
    supabase.storage.from('avatars').remove([datos.avatarAnterior]).then(({ error }) => {
      if (error) registrarError('guardarPerfil.borrarAnterior', error);
    });
  }
  return { ok: true };
}

/** Valores del paso «¿Cómo os organizáis el dinero?». Los porcentajes son siempre los de quien crea el espacio (m1). */
export type AjustesDinero = {
  bote: boolean;
  /** Solo con bote: aportación fija cada mes o a mano. */
  rellenoMensual: boolean;
  aportacionCents: number | null;
  diaAportacion: number | null;
  /** % de m1 en el bote (50 = a medias). */
  pctBoteM1: number;
  reparto: 'mixed' | 'all_pot' | 'half' | 'proportional';
  /** % de m1 en los gastos proporcionales. */
  pctProporcionalM1: number;
};

/**
 * Guarda los ajustes de dinero. La RLS solo deja editarlos mientras la otra persona no se ha unido: si ya
 * se unió, el update no toca ninguna fila y se devuelve `codigo: 'pareja_unida'` (la pantalla refresca la fase).
 */
export async function guardarDinero(coupleId: string, a: AjustesDinero): Promise<Resultado> {
  const mensual = a.bote && a.rellenoMensual;
  const { data, error } = await supabase
    .from('couple_settings')
    .update({
      pot_enabled: a.bote,
      pot_funding: mensual ? 'monthly' : 'manual',
      pot_monthly_cents: mensual ? a.aportacionCents : null,
      pot_day: mensual ? a.diaAportacion : null,
      // «Hoy» en la zona de la pareja (M3); el servidor lo sube a hoy si llega antes (I4).
      pot_started_on: mensual ? hoyISO() : null,
      pot_pct_m1: a.bote ? a.pctBoteM1 : 50,
      default_split: a.reparto,
      proportional_pct_m1: a.pctProporcionalM1,
    })
    .eq('couple_id', coupleId)
    .select('couple_id');
  if (error) {
    registrarError('guardarDinero', error);
    return { ok: false, mensaje: esErrorDeRed(error) ? SIN_CONEXION : 'No se ha podido guardar. Inténtalo de nuevo.' };
  }
  if (!data || data.length === 0) {
    return { ok: false, mensaje: 'Tu pareja ya se ha unido: podréis cambiarlo juntos en Ajustes.', codigo: 'pareja_unida' };
  }
  return { ok: true };
}
