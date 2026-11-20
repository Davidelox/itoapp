// Edge Function «enviar-avisos» (docs/plan-avisos-push.md §5). La llama pg_cron (vía pg_net) cada minuto si hay trabajo.
//   1. push_claim: reserva los avisos listos con los tokens de su usuario.
//   2. Los manda al servicio push de Expo en lotes de 100 y clasifica los tickets.
//   3. push_finish: marca enviados / reintento (1, 5, 15 min) / fallidos, guarda tickets y borra tokens muertos.
//   4. Recibos de hace más de 15 min: borra los tokens DeviceNotRegistered.
// Se despliega SIN «Verify JWT»: no la llama un usuario, sino la base de datos con un secreto compartido (AVISOS_SECRET).
// service_role solo existe aquí (SUPABASE_SERVICE_ROLE_KEY la inyecta Supabase); nunca va en la app.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  type FilaCola,
  type SalidaEnvio,
  clasificarHttp,
  clasificarRecibos,
  clasificarTicket,
  construirMensajes,
  extraerBearer,
  igualesConstante,
  resolverFilas,
  trocear,
} from './logica.ts';

const URL_ENVIO = 'https://exp.host/--/api/v2/push/send';
const URL_RECIBOS = 'https://exp.host/--/api/v2/push/getReceipts';
const TIMEOUT_MS = 20_000;

const responder = (estado: number, cuerpo: Record<string, unknown>) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

async function llamarExpo(url: string, cuerpo: unknown, tokenExpo: string | undefined) {
  const cabeceras: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (tokenExpo) cabeceras.Authorization = `Bearer ${tokenExpo}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: cabeceras,
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = await res.json().catch(() => null);
    return { estado: res.status as number | null, json };
  } catch (e) {
    console.error('expo', url, e instanceof Error ? e.name : e);
    return { estado: null as number | null, json: null }; // red o timeout: transitorio
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return responder(405, { error: 'metodo' });

  const secreto = Deno.env.get('AVISOS_SECRET');
  const url = Deno.env.get('SUPABASE_URL');
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secreto || !url || !servicio) return responder(500, { error: 'configuracion' });

  const recibido = extraerBearer(req.headers.get('Authorization'));
  if (recibido === null || !igualesConstante(recibido, secreto)) return responder(401, { error: 'no_autorizado' });

  const tokenExpo = Deno.env.get('EXPO_ACCESS_TOKEN') || undefined;
  const admin = createClient(url, servicio, { auth: { persistSession: false } });

  // 1-3. Envío
  const { data: filas, error: errorClaim } = await admin.rpc('push_claim', { p_limit: 200 });
  if (errorClaim) {
    console.error('push_claim', errorClaim);
    return responder(500, { error: 'claim' });
  }
  const cola = (filas ?? []) as FilaCola[];
  let enviados = 0;
  if (cola.length > 0) {
    const { mensajes, destinos } = construirMensajes(cola);
    const salidas: SalidaEnvio[] = [];
    const lotesMensajes = trocear(mensajes);
    const lotesDestinos = trocear(destinos);
    for (let i = 0; i < lotesMensajes.length; i++) {
      const lote = lotesDestinos[i];
      const { estado, json } = await llamarExpo(URL_ENVIO, lotesMensajes[i], tokenExpo);
      const clase = clasificarHttp(estado);
      const tickets: unknown[] | null = clase === 'ok' && Array.isArray(json?.data) ? json.data : null;
      lote.forEach((destino, j) => {
        if (tickets) {
          salidas.push(clasificarTicket(destino, tickets[j] as Parameters<typeof clasificarTicket>[1]));
        } else {
          const motivo = estado === null ? 'red' : `http_${estado}`;
          salidas.push({ ...destino, resultado: clase === 'error' ? 'error' : 'transitorio', error: motivo });
        }
      });
    }
    const resultado = resolverFilas(cola, salidas);
    // Si push_finish falla, las filas vuelven a la cola a los 10 min y se repetiría el aviso: se intenta dos veces.
    let { error: errorFinish } = await admin.rpc('push_finish', { p_result: resultado });
    if (errorFinish) ({ error: errorFinish } = await admin.rpc('push_finish', { p_result: resultado }));
    if (errorFinish) console.error('push_finish', errorFinish);
    enviados = resultado.filter((r) => r.status === 'sent').length;
  }

  // 4. Recibos
  let revisados = 0;
  const { data: pendientes, error: errorPendientes } = await admin.rpc('push_receipts_pending');
  if (errorPendientes) {
    console.error('push_receipts_pending', errorPendientes);
  } else {
    const lista = (pendientes ?? []) as { ticket_id: string; token: string }[];
    if (lista.length > 0) {
      const { estado, json } = await llamarExpo(URL_RECIBOS, { ids: lista.map((p) => p.ticket_id) }, tokenExpo);
      if (clasificarHttp(estado) === 'ok' && json?.data && typeof json.data === 'object') {
        const resumen = clasificarRecibos(lista, json.data);
        const { error } = await admin.rpc('push_receipts_done', { p_result: resumen });
        if (error) console.error('push_receipts_done', error);
        revisados = resumen.checked.length;
      }
    }
  }

  return responder(200, { ok: true, avisos: cola.length, enviados, recibos: revisados });
});
