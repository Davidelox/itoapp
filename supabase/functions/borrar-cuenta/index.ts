// Edge Function «borrar-cuenta» (docs/plan-ajustes.md §6.4).
// Borra la cuenta de quien llama:
//   1. sale del espacio con su propia sesión (leave_couple: borra lo privado y, si no queda nadie, el espacio);
//   2. borra sus fotos de perfil (carpeta avatars/<uid>/);
//   3. borra el usuario de auth (en cascada: profiles y su fila de couple_members).
// Los gastos compartidos se quedan para la pareja. La clave service_role solo existe aquí, en el servidor
// (Supabase la inyecta como SUPABASE_SERVICE_ROLE_KEY); nunca va en la app.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cabeceras = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responder = (estado: number, cuerpo: Record<string, unknown>) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...cabeceras, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabeceras });
  if (req.method !== 'POST') return responder(405, { error: 'metodo' });

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const autorizacion = req.headers.get('Authorization');
  if (!url || !anon || !servicio) return responder(500, { error: 'configuracion' });
  if (!autorizacion) return responder(401, { error: 'sin_sesion' });

  // Cliente con la sesión de quien llama: así leave_couple corre con sus permisos.
  const usuario = createClient(url, anon, { global: { headers: { Authorization: autorizacion } }, auth: { persistSession: false } });
  // El token se pasa explícito: sin sesión guardada, getUser() sin argumento depende de la cabecera global.
  const token = autorizacion.replace(/^Bearer\s+/i, '');
  const { data: datos, error: errorUsuario } = await usuario.auth.getUser(token);
  if (errorUsuario || !datos.user) return responder(401, { error: 'sin_sesion' });
  const uid = datos.user.id;

  // 1. Salir del espacio (TW001 = no estaba en ninguno: se sigue).
  const salida = await usuario.rpc('leave_couple');
  if (salida.error && salida.error.code !== 'TW001') {
    console.error('leave_couple', salida.error);
    return responder(500, { error: 'salir' });
  }

  const admin = createClient(url, servicio, { auth: { persistSession: false } });

  // 2. Fotos de perfil (si falla, se sigue: solo quedarían archivos huérfanos).
  const { data: fotos } = await admin.storage.from('avatars').list(uid, { limit: 100 });
  if (fotos && fotos.length > 0) {
    const { error } = await admin.storage.from('avatars').remove(fotos.map((f) => `${uid}/${f.name}`));
    if (error) console.error('avatars', error);
  }

  // 3. Usuario de auth.
  const { error: errorBorrar } = await admin.auth.admin.deleteUser(uid);
  if (errorBorrar) {
    console.error('deleteUser', errorBorrar);
    return responder(500, { error: 'borrar' });
  }
  return responder(200, { ok: true });
});
