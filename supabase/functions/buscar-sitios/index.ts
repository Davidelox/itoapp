// Edge Function «buscar-sitios» (docs/plan-mapa.md F4): busca sitios en Photon (OpenStreetMap, sin clave).
// Se despliega CON «Verify JWT»; además se valida el token aquí. Sin secretos: Photon es público.
// No se registra el texto buscado ni se envía nada de la pareja o del usuario al proveedor.
// Cambiar de proveedor: sustituir `consultarProveedor` y su normalización en logica.ts; la app no cambia.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  type EntradaCache,
  type SitioBuscado,
  claveCache,
  guardarCache,
  leerCache,
  normalizarRespuesta,
  permitir,
  urlPhoton,
  validarEntrada,
} from './logica.ts';

const TIMEOUT_MS = 6_000;
const cabeceras = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responder = (estado: number, cuerpo: Record<string, unknown>) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...cabeceras, 'Content-Type': 'application/json' } });

// En memoria de la instancia: sirve para frenar abusos y repeticiones, no es una garantía global.
const peticiones = new Map<string, number[]>();
const cache = new Map<string, EntradaCache>();

async function consultarProveedor(url: string): Promise<SitioBuscado[] | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'app-mapa/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // Solo el código y el proveedor: nunca el texto buscado ni datos del usuario.
      console.error(`buscar-sitios: el proveedor respondió ${res.status}`);
      return null;
    }
    const resultados = normalizarRespuesta(await res.json().catch(() => null));
    if (!resultados) console.error('buscar-sitios: respuesta del proveedor no válida');
    return resultados;
  } catch (e) {
    console.error(`buscar-sitios: fallo al llamar al proveedor (${e instanceof Error ? e.name : 'error'})`);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabeceras });
  if (req.method !== 'POST') return responder(405, { error: 'metodo' });

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anon) return responder(500, { error: 'configuracion' });

  const autorizacion = req.headers.get('Authorization');
  if (!autorizacion) return responder(401, { error: 'sin_sesion' });
  const usuario = createClient(url, anon, { global: { headers: { Authorization: autorizacion } }, auth: { persistSession: false } });
  const { data, error } = await usuario.auth.getUser(autorizacion.replace(/^Bearer\s+/i, ''));
  if (error || !data.user) return responder(401, { error: 'sin_sesion' });

  // Solo miembros activos de una pareja (la RLS de couple_members solo deja ver la fila si está activa).
  const { data: miembro, error: errorMiembro } = await usuario
    .from('couple_members')
    .select('couple_id')
    .eq('user_id', data.user.id)
    .is('left_at', null)
    .limit(1)
    .maybeSingle();
  if (errorMiembro) return responder(500, { error: 'interno' });
  if (!miembro) return responder(403, { error: 'sin_pareja' });

  const entrada = validarEntrada(await req.json().catch(() => null));
  if (!entrada) return responder(400, { error: 'entrada' });

  const ahora = Date.now();
  const clave = claveCache(entrada);
  const guardado = leerCache(cache, clave, ahora);
  if (guardado) return responder(200, { resultados: guardado });

  if (!permitir(peticiones, data.user.id, ahora)) return responder(429, { error: 'limite' });

  const resultados = await consultarProveedor(urlPhoton(entrada));
  if (!resultados) return responder(503, { error: 'cuota' });
  guardarCache(cache, clave, resultados, ahora);
  return responder(200, { resultados });
});
