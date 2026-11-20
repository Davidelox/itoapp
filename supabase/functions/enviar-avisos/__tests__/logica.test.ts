import {
  clasificarHttp,
  clasificarRecibos,
  clasificarTicket,
  construirMensajes,
  esperaReintento,
  extraerBearer,
  igualesConstante,
  resolverFilas,
  trocear,
  type FilaCola,
  type SalidaEnvio,
} from '../logica';

const fila = (id: string, tokens: string[], attempts = 1): FilaCola => ({ id, title: 'T', body: 'B', url: '/x', attempts, tokens });

describe('trocear', () => {
  it('parte en lotes de 100', () => {
    const lotes = trocear(Array.from({ length: 250 }, (_, i) => i));
    expect(lotes.map((l) => l.length)).toEqual([100, 100, 50]);
  });
  it('vacío y justo en el límite', () => {
    expect(trocear([])).toEqual([]);
    expect(trocear(Array.from({ length: 100 }, (_, i) => i)).length).toBe(1);
  });
});

describe('construirMensajes', () => {
  it('un mensaje por token con su destino alineado', () => {
    const { mensajes, destinos } = construirMensajes([fila('a', ['t1', 't2']), fila('b', []), fila('c', ['t3'])]);
    expect(mensajes.map((m) => m.to)).toEqual(['t1', 't2', 't3']);
    expect(destinos).toEqual([
      { outboxId: 'a', token: 't1' },
      { outboxId: 'a', token: 't2' },
      { outboxId: 'c', token: 't3' },
    ]);
    expect(mensajes[0]).toMatchObject({ sound: 'default', channelId: 'default', priority: 'high', data: { url: '/x' } });
  });
});

describe('esperaReintento', () => {
  it('1, 5 y 15 minutos y luego nada', () => {
    expect([1, 2, 3, 4, 5].map(esperaReintento)).toEqual([1, 5, 15, null, null]);
  });
});

describe('clasificarHttp', () => {
  it('2xx ok, 429/5xx/red transitorio, resto error', () => {
    expect(clasificarHttp(200)).toBe('ok');
    expect(clasificarHttp(429)).toBe('transitorio');
    expect(clasificarHttp(503)).toBe('transitorio');
    expect(clasificarHttp(null)).toBe('transitorio');
    expect(clasificarHttp(400)).toBe('error');
    expect(clasificarHttp(401)).toBe('error');
  });
});

describe('clasificarTicket', () => {
  const d = { outboxId: 'a', token: 't1' };
  it('ok con id', () => expect(clasificarTicket(d, { status: 'ok', id: 'tk' })).toMatchObject({ resultado: 'ok', ticketId: 'tk' }));
  it('DeviceNotRegistered', () =>
    expect(clasificarTicket(d, { status: 'error', details: { error: 'DeviceNotRegistered' } }).resultado).toBe('muerto'));
  it('otro error de ticket', () =>
    expect(clasificarTicket(d, { status: 'error', message: 'x', details: { error: 'MessageTooBig' } })).toMatchObject({
      resultado: 'error',
      error: 'MessageTooBig',
    }));
  it('ticket ausente', () => expect(clasificarTicket(d, undefined).resultado).toBe('transitorio'));
  it('MessageRateExceeded se reintenta', () =>
    expect(clasificarTicket(d, { status: 'error', details: { error: 'MessageRateExceeded' } }).resultado).toBe('transitorio'));
});

describe('resolverFilas', () => {
  const s = (outboxId: string, token: string, resultado: SalidaEnvio['resultado'], extra: Partial<SalidaEnvio> = {}): SalidaEnvio => ({
    outboxId,
    token,
    resultado,
    ...extra,
  });

  it('entrega correcta: sent con tickets y tokens muertos', () => {
    const [r] = resolverFilas([fila('a', ['t1', 't2'])], [s('a', 't1', 'ok', { ticketId: 'k1' }), s('a', 't2', 'muerto')]);
    expect(r).toMatchObject({ status: 'sent', tickets: [{ ticket_id: 'k1', token: 't1' }], dead_tokens: ['t2'] });
  });
  it('sin tokens: sent con sin_dispositivos', () => {
    expect(resolverFilas([fila('a', [])], [])[0]).toMatchObject({ status: 'sent', error: 'sin_dispositivos' });
  });
  it('solo tokens muertos: sent sin reintento', () => {
    expect(resolverFilas([fila('a', ['t1'])], [s('a', 't1', 'muerto')])[0]).toMatchObject({ status: 'sent', dead_tokens: ['t1'] });
  });
  it('fallo transitorio: reintento con espera según el intento', () => {
    expect(resolverFilas([fila('a', ['t1'], 1)], [s('a', 't1', 'transitorio', { error: 'http_503' })])[0]).toMatchObject({
      status: 'retry',
      delay_min: 1,
    });
    expect(resolverFilas([fila('a', ['t1'], 3)], [s('a', 't1', 'transitorio')])[0]).toMatchObject({ status: 'retry', delay_min: 15 });
  });
  it('a los 4 intentos, failed', () => {
    expect(resolverFilas([fila('a', ['t1'], 4)], [s('a', 't1', 'transitorio', { error: 'http_503' })])[0]).toMatchObject({
      status: 'failed',
      delay_min: null,
    });
  });
  it('error de configuración: failed sin reintento', () => {
    expect(resolverFilas([fila('a', ['t1'], 1)], [s('a', 't1', 'error', { error: 'InvalidCredentials' })])[0]).toMatchObject({
      status: 'failed',
      error: 'InvalidCredentials',
    });
  });
  it('mezcla ok + transitorio: sent (no repite el aviso)', () => {
    const [r] = resolverFilas([fila('a', ['t1', 't2'])], [s('a', 't1', 'ok', { ticketId: 'k1' }), s('a', 't2', 'transitorio', { error: 'red' })]);
    expect(r.status).toBe('sent');
  });
  it('cada fila con lo suyo', () => {
    const r = resolverFilas([fila('a', ['t1']), fila('b', ['t2'])], [s('a', 't1', 'ok', { ticketId: 'k1' }), s('b', 't2', 'transitorio')]);
    expect(r.map((x) => x.status)).toEqual(['sent', 'retry']);
  });
});

describe('clasificarRecibos', () => {
  const pend = [
    { ticket_id: 'k1', token: 't1' },
    { ticket_id: 'k2', token: 't2' },
    { ticket_id: 'k3', token: 't3' },
  ];
  it('revisa los que tienen recibo y borra los muertos', () => {
    const r = clasificarRecibos(pend, {
      k1: { status: 'ok' },
      k2: { status: 'error', details: { error: 'DeviceNotRegistered' } },
    });
    expect(r).toEqual({ checked: ['k1', 'k2'], dead_tokens: ['t2'] });
  });
  it('otro error de recibo se revisa sin borrar el token', () => {
    expect(clasificarRecibos(pend, { k1: { status: 'error', details: { error: 'MessageRateExceeded' } } })).toEqual({
      checked: ['k1'],
      dead_tokens: [],
    });
  });
});

describe('igualesConstante y extraerBearer', () => {
  it('compara', () => {
    expect(igualesConstante('abc', 'abc')).toBe(true);
    expect(igualesConstante('abc', 'abd')).toBe(false);
    expect(igualesConstante('abc', 'abcd')).toBe(false);
    expect(igualesConstante('', 'a')).toBe(false);
  });
  it('extrae el secreto', () => {
    expect(extraerBearer('Bearer xyz')).toBe('xyz');
    expect(extraerBearer('bearer xyz')).toBe('xyz');
    expect(extraerBearer('Basic xyz')).toBeNull();
    expect(extraerBearer(null)).toBeNull();
  });
});
