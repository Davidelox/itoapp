import { urlCallback } from '@/lib/auth/enlaces';
import { marcarCierreVoluntario } from '@/lib/auth/cierre';
import { MENSAJES, type Resultado, esCodigoNoValido, esErrorDeRed, traducirErrorAuth } from '@/lib/auth/errores';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

export type { Resultado };

/** Email normalizado antes de enviarlo. */
export const normalizarEmail = (email: string) => email.trim().toLowerCase();

export const emailValido = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizarEmail(email));

/** Misma política que el servidor: 10 a 72 bytes (límite de bcrypt), con letras y números. */
export function contrasenaValida(password: string): boolean {
  const bytes = new TextEncoder().encode(password).length;
  return password.length >= 10 && bytes <= 72 && /\p{L}/u.test(password) && /\d/.test(password);
}

const fallo = (contexto: string, error: unknown): Resultado => {
  registrarError(contexto, error);
  return { ok: false, mensaje: traducirErrorAuth(error) };
};

/**
 * Alta con email. Con la confirmación obligatoria no devuelve sesión. Con un email que ya existe
 * Supabase tampoco da error: la app actúa igual que con uno nuevo (no revela si hay cuenta).
 */
export async function crearCuenta(email: string, password: string): Promise<Resultado> {
  const { error } = await supabase.auth.signUp({
    email: normalizarEmail(email),
    password,
    options: { emailRedirectTo: urlCallback() },
  });
  return error ? fallo('crearCuenta', error) : { ok: true };
}

/**
 * Comprueba el código de 6 cifras del email. Para confirmar un registro se prueba `'email'` y,
 * si el servidor lo rechaza como código no válido, `'signup'` (obsoleto pero admitido).
 * Pendiente de comprobar con una cuenta real cuál de los dos acepta el proyecto (docs/plan-onboarding.md §11.4).
 */
export async function verificarCodigo(
  email: string,
  codigo: string,
  tipo: 'email' | 'recovery',
): Promise<Resultado> {
  const datos = { email: normalizarEmail(email), token: codigo.replace(/\D/g, '') };
  let { error } = await supabase.auth.verifyOtp({ ...datos, type: tipo });
  if (error && tipo === 'email' && esCodigoNoValido(error) && !esErrorDeRed(error)) {
    const segundo = await supabase.auth.verifyOtp({ ...datos, type: 'signup' });
    error = segundo.error;
  }
  return error ? fallo('verificarCodigo', error) : { ok: true };
}

export async function reenviarCodigo(email: string): Promise<Resultado> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: normalizarEmail(email),
    options: { emailRedirectTo: urlCallback() },
  });
  return error ? fallo('reenviarCodigo', error) : { ok: true };
}

/** `codigo: 'no_confirmado'` solo sale con la contraseña correcta, así que no delata si el email existe. */
export async function entrar(email: string, password: string): Promise<Resultado> {
  const { error } = await supabase.auth.signInWithPassword({ email: normalizarEmail(email), password });
  if (!error) return { ok: true };
  registrarError('entrar', error);
  if (error.code === 'email_not_confirmed') {
    return { ok: false, mensaje: MENSAJES.noConfirmado, codigo: 'no_confirmado' };
  }
  return { ok: false, mensaje: traducirErrorAuth(error) };
}

/** Siempre el mismo resultado haya o no cuenta; solo se informa de fallos de red y de límites. */
export async function pedirRecuperacion(email: string): Promise<Resultado> {
  const { error } = await supabase.auth.resetPasswordForEmail(normalizarEmail(email));
  return error ? fallo('pedirRecuperacion', error) : { ok: true };
}

export async function cambiarContrasena(password: string): Promise<Resultado> {
  const { error } = await supabase.auth.updateUser({ password });
  return error ? fallo('cambiarContrasena', error) : { ok: true };
}

/** Cierra solo la sesión de este dispositivo. */
export async function cerrarSesion(): Promise<void> {
  marcarCierreVoluntario();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) registrarError('cerrarSesion', error);
}
