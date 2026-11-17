import { type GastoSaldable, type Pago, resultadoFinal, saldables, sePuedeDeshacer, textoBoton, textoPago, totalDe } from '@/lib/gastos/saldar';

const n = (s: string) => s.replace(/ /g, ' ');
const g = (id: string, paid_by: GastoSaldable['paid_by'], m1: number, m2: number, pot = 0, extra: Partial<GastoSaldable> = {}): GastoSaldable => ({
  id,
  paid_by,
  share_m1_cents: m1,
  share_m2_cents: m2,
  share_pot_cents: pot,
  visible_to_partner: true,
  settlement_id: null,
  ...extra,
});

// Datos del mockup: Olivo (+31), Gasolina (+22,50), Cine (−9), Farmacia (−21,10) vistos por David (m1).
const datos = [
  g('olivo', 'm1', 3100, 3100),
  g('gasolina', 'm1', 2250, 2250),
  g('cine', 'm2', 900, 900),
  g('farmacia', 'm2', 2110, 2110),
  g('bote', 'pot', 0, 0, 5430),
  g('soloMio', 'm1', 1500, 0),
  g('privado', 'm1', 1500, 0, 0, { visible_to_partner: false }),
  g('saldado', 'm1', 1000, 1000, 0, { settlement_id: 's1' }),
  g('borrando', 'm1', 500, 500),
];

describe('qué se puede saldar', () => {
  it('excluye bote, solo tuyo, privado, saldado y pendiente de borrar', () => {
    expect(saldables('m1', datos, new Set(['borrando'])).map((x) => x.id)).toEqual(['olivo', 'gasolina', 'cine', 'farmacia']);
  });
  it('total con signo: David +23,40 € y Meri −23,40 €', () => {
    const lista = saldables('m1', datos, new Set(['borrando']));
    expect(totalDe('m1', lista)).toBe(2340);
    expect(totalDe('m2', lista)).toBe(-2340);
  });
  it('un gasto del bote pagado por ti no es deuda entre los dos', () => {
    expect(saldables('m2', [g('x', 'm2', 0, 0, 800)], new Set())).toEqual([]);
  });
});

describe('textos', () => {
  it('botón', () => {
    expect(n(textoBoton(3590, 3))).toBe('He recibido 35,90 €');
    expect(n(textoBoton(-1200, 1))).toBe('He pagado 12,00 €');
    expect(textoBoton(0, 2)).toBe('Marcar como saldado');
    expect(textoBoton(0, 0)).toBe('Elige qué quieres saldar');
  });
  const pago = (p: Partial<Pago>): Pago => ({
    id: 'p',
    from_slot: 'm2',
    to_slot: 'm1',
    amount_cents: 3590,
    method: 'bizum',
    status: 'confirmed',
    created_by: 'u1',
    created_at: new Date(0).toISOString(),
    responded_by: 'u1',
    responded_at: null,
    ...p,
  });
  it('cuentas a cero y en parte', () => {
    expect(resultadoFinal(pago({}), 'm1', 0, 'Meri').titulo).toBe('¡Cuentas a cero!');
    expect(n(resultadoFinal(pago({}), 'm1', 0, 'Meri').texto)).toBe('Meri te ha pagado 35,90 € por Bizum.');
    expect(n(resultadoFinal(pago({}), 'm1', 490, 'Meri').titulo)).toBe('Saldado en parte · queda 4,90 €');
  });
  it('pendiente de confirmar', () => {
    const r = resultadoFinal(pago({ status: 'pending', from_slot: 'm1', to_slot: 'm2', amount_cents: 1200 }), 'm1', 0, 'Meri');
    expect(r.titulo).toBe('Falta que Meri lo confirme');
    expect(n(r.texto)).toBe('Has marcado que pagaste 12,00 € por Bizum. Meri lo confirmará en su app.');
  });
  it('texto del pago desde los dos lados', () => {
    expect(n(textoPago(pago({}), 'm1', 'Meri'))).toBe('Meri te pagó 35,90 €');
    expect(n(textoPago(pago({}), 'm2', 'David'))).toBe('Pagaste 35,90 € a David');
    expect(textoPago(pago({ amount_cents: 0 }), 'm2', 'David')).toBe('Gastos compensados');
  });
  it('deshacer: quien lo registró, pendiente o 10 minutos', () => {
    const ahora = Date.parse('2026-11-17T10:00:00Z');
    const hace = (min: number) => new Date(ahora - min * 60_000).toISOString();
    expect(sePuedeDeshacer(pago({ created_at: hace(5) }), 'u1', ahora)).toBe(true);
    expect(sePuedeDeshacer(pago({ created_at: hace(11) }), 'u1', ahora)).toBe(false);
    expect(sePuedeDeshacer(pago({ created_at: hace(60), status: 'pending' }), 'u1', ahora)).toBe(true);
    expect(sePuedeDeshacer(pago({ created_at: hace(1) }), 'u2', ahora)).toBe(false);
    expect(sePuedeDeshacer(pago({ created_at: hace(1), status: 'rejected' }), 'u1', ahora)).toBe(false);
    // Confirmado por la otra persona: ya no se deshace aunque no hayan pasado 10 minutos (revisión I4).
    expect(sePuedeDeshacer(pago({ created_at: hace(1), responded_by: 'u2' }), 'u1', ahora)).toBe(false);
  });
});
