import { conPlazo, ejecutarPaso, textoIntento } from '@/lib/avisos/plazo';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('conPlazo', () => {
  it('devuelve el valor si llega a tiempo', async () => {
    await expect(conPlazo(Promise.resolve(7), 1000)).resolves.toBe(7);
  });
  it('rechaza si la promesa nunca resuelve', async () => {
    const r = conPlazo(new Promise(() => undefined), 1000);
    jest.advanceTimersByTime(1000);
    await expect(r).rejects.toThrow('plazo agotado');
  });
});

describe('ejecutarPaso', () => {
  it('ok con el valor', async () => {
    await expect(ejecutarPaso('token', 1000, async () => 'x')).resolves.toEqual({ ok: true, valor: 'x' });
  });
  it('timeout con el paso', async () => {
    const r = ejecutarPaso('token', 1000, () => new Promise(() => undefined));
    jest.advanceTimersByTime(1000);
    await expect(r).resolves.toEqual({ ok: false, fallo: { paso: 'token', motivo: 'timeout', detalle: 'plazo agotado' } });
  });
  it('error sin lanzar y con el detalle truncado', async () => {
    const r = await ejecutarPaso('servidor', 1000, async () => {
      throw new Error('a'.repeat(300));
    });
    expect(r).toMatchObject({ ok: false, fallo: { paso: 'servidor', motivo: 'error' } });
    if (!r.ok) expect(r.fallo.detalle).toHaveLength(120);
  });
  it('captura errores síncronos', async () => {
    const r = await ejecutarPaso('canal', 1000, () => {
      throw new Error('boom');
    });
    expect(r).toMatchObject({ ok: false, fallo: { paso: 'canal', detalle: 'boom' } });
  });
});

describe('textoIntento', () => {
  const base = { hora: new Date(2026, 10, 21, 21, 5).toISOString(), permiso: 'concedido', projectId: true, dispositivoReal: true };
  it('fallo de token por plazo', () => {
    const t = textoIntento({ ...base, ok: false, fallo: { paso: 'token', motivo: 'timeout', detalle: '' } });
    expect(t).toContain('permiso concedido · token: tiempo agotado a las 21:05');
  });
  it('ok', () => expect(textoIntento({ ...base, ok: true, fallo: null })).toContain('registrado'));
});
