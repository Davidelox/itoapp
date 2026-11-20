// Lógica pura de «enviar-avisos» (docs/plan-avisos-push.md §5): sin APIs de Deno ni red, para probarla con Jest.

export const TAM_LOTE = 100; // máximo de mensajes por llamada a Expo
export const MAX_INTENTOS = 4;
const ESPERAS_MIN = [1, 5, 15]; // tras el intento 1, 2 y 3

export type FilaCola = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  attempts: number;
  tokens: string[];
};

export type MensajeExpo = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: { url: string | null };
  channelId: 'default';
  priority: 'high';
};

export type Destino = { outboxId: string; token: string };

export type SalidaEnvio = {
  outboxId: string;
  token: string;
  resultado: 'ok' | 'muerto' | 'error' | 'transitorio';
  ticketId?: string;
  error?: string;
};

export type ResultadoFila = {
  id: string;
  status: 'sent' | 'retry' | 'failed';
  error: string | null;
  delay_min: number | null;
  tickets: { ticket_id: string; token: string }[];
  dead_tokens: string[];
};

export function trocear<T>(elementos: T[], tam: number = TAM_LOTE): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < elementos.length; i += tam) lotes.push(elementos.slice(i, i + tam));
  return lotes;
}

// Un mensaje por token, con su destino en la misma posición.
export function construirMensajes(filas: FilaCola[]): { mensajes: MensajeExpo[]; destinos: Destino[] } {
  const mensajes: MensajeExpo[] = [];
  const destinos: Destino[] = [];
  for (const f of filas) {
    for (const token of f.tokens) {
      mensajes.push({
        to: token,
        title: f.title,
        body: f.body,
        sound: 'default',
        data: { url: f.url },
        channelId: 'default',
        priority: 'high',
      });
      destinos.push({ outboxId: f.id, token });
    }
  }
  return { mensajes, destinos };
}

// Minutos de espera tras el intento n (1, 2, 3); null = sin más intentos.
export function esperaReintento(intentos: number): number | null {
  if (intentos >= MAX_INTENTOS) return null;
  return ESPERAS_MIN[Math.max(intentos, 1) - 1];
}

// Respuesta HTTP de Expo a un lote: 'ok' | 'transitorio' (429, 5xx, red) | 'error' (resto: configuración).
export function clasificarHttp(estado: number | null): 'ok' | 'transitorio' | 'error' {
  if (estado === null) return 'transitorio';
  if (estado >= 200 && estado < 300) return 'ok';
  if (estado === 429 || estado >= 500) return 'transitorio';
  return 'error';
}

type TicketExpo = { status?: string; id?: string; message?: string; details?: { error?: string } };

// Ticket de un mensaje → su salida. Ticket ausente = respuesta incompleta (transitorio).
export function clasificarTicket(destino: Destino, ticket: TicketExpo | undefined): SalidaEnvio {
  const base = { outboxId: destino.outboxId, token: destino.token };
  if (!ticket) return { ...base, resultado: 'transitorio', error: 'ticket_ausente' };
  if (ticket.status === 'ok' && ticket.id) return { ...base, resultado: 'ok', ticketId: ticket.id };
  const codigo = ticket.details?.error;
  if (codigo === 'DeviceNotRegistered') return { ...base, resultado: 'muerto', error: codigo };
  if (codigo === 'MessageRateExceeded') return { ...base, resultado: 'transitorio', error: codigo }; // demasiados a ese móvil
  return { ...base, resultado: 'error', error: codigo ?? ticket.message ?? 'error_ticket' };
}

// Salidas de todos los mensajes → una decisión por fila de la cola (entrada de push_finish).
//  - alguna entrega correcta → sent (no se reintenta: repetiría el aviso a los móviles que sí lo recibieron);
//  - sin entregas y algún fallo transitorio → retry con espera (o failed si agotó los intentos);
//  - solo tokens muertos o sin tokens → sent con aviso en last_error (no hay a quién avisar);
//  - solo errores de configuración → failed, sin reintento.
export function resolverFilas(filas: FilaCola[], salidas: SalidaEnvio[]): ResultadoFila[] {
  return filas.map((f) => {
    const mias = salidas.filter((s) => s.outboxId === f.id);
    const tickets = mias.filter((s) => s.resultado === 'ok').map((s) => ({ ticket_id: s.ticketId as string, token: s.token }));
    const dead_tokens = mias.filter((s) => s.resultado === 'muerto').map((s) => s.token);
    const transitorios = mias.filter((s) => s.resultado === 'transitorio');
    const errores = mias.filter((s) => s.resultado === 'error');
    const base = { id: f.id, tickets, dead_tokens };

    if (f.tokens.length === 0) return { ...base, status: 'sent', error: 'sin_dispositivos', delay_min: null };
    if (tickets.length > 0) {
      const parcial = [...transitorios, ...errores][0]?.error ?? null;
      return { ...base, status: 'sent', error: parcial, delay_min: null };
    }
    if (transitorios.length > 0) {
      const espera = esperaReintento(f.attempts);
      return espera === null
        ? { ...base, status: 'failed', error: transitorios[0].error ?? 'reintentos_agotados', delay_min: null }
        : { ...base, status: 'retry', error: transitorios[0].error ?? 'transitorio', delay_min: espera };
    }
    if (errores.length > 0) return { ...base, status: 'failed', error: errores[0].error ?? 'error', delay_min: null };
    return { ...base, status: 'sent', error: 'sin_dispositivos', delay_min: null };
  });
}

type ReciboExpo = { status?: string; details?: { error?: string } };

// Recibos de Expo (por ticket_id) → tickets revisados y tokens muertos. Sin recibo = aún no disponible.
export function clasificarRecibos(
  pendientes: { ticket_id: string; token: string }[],
  recibos: Record<string, ReciboExpo | undefined>,
): { checked: string[]; dead_tokens: string[] } {
  const checked: string[] = [];
  const dead = new Set<string>();
  for (const p of pendientes) {
    const r = recibos[p.ticket_id];
    if (!r) continue;
    checked.push(p.ticket_id);
    if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') dead.add(p.token);
  }
  return { checked, dead_tokens: [...dead] };
}

// Comparación en tiempo constante (no se corta en el primer byte distinto).
export function igualesConstante(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// «Bearer <secreto>» → secreto, o null.
export function extraerBearer(cabecera: string | null): string | null {
  const m = cabecera?.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}
