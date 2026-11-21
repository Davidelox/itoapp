import { datosEventoGasto, decidirAccion, idEventoDeGasto, idVisitaDeGasto } from '@/lib/gastos/visitaAutomatica';

const base = { hoy: '2026-11-22', categoria: 'eating_out' as const, planId: null };

describe('decidirAccion', () => {
  it('pasada registra, hoy pregunta, futura no hace nada', () => {
    expect(decidirAccion({ ...base, fecha: '2026-11-21' })).toBe('registrar');
    expect(decidirAccion({ ...base, fecha: '2026-11-22' })).toBe('preguntar');
    expect(decidirAccion({ ...base, fecha: '2026-11-23' })).toBe('nada');
  });
  it('categorías rutinarias y gastos de un plan no hacen nada', () => {
    for (const categoria of ['home', 'groceries', 'transport', 'subscriptions', 'health', 'gifts'] as const) {
      expect(decidirAccion({ ...base, categoria, fecha: '2026-11-01' })).toBe('nada');
    }
    expect(decidirAccion({ ...base, planId: 'p', fecha: '2026-11-01' })).toBe('nada');
  });
  it('ocio y otros sí cuentan', () => {
    expect(decidirAccion({ ...base, categoria: 'leisure', fecha: '2026-11-01' })).toBe('registrar');
    expect(decidirAccion({ ...base, categoria: 'other', fecha: '2026-11-22' })).toBe('preguntar');
  });
});

describe('ids derivados', () => {
  const id = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
  it('deterministas, válidos y distintos entre sí y del gasto', () => {
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(idVisitaDeGasto(id)).toBe(idVisitaDeGasto(id));
    expect(idVisitaDeGasto(id)).toMatch(re);
    expect(idEventoDeGasto(id)).toMatch(re);
    expect(new Set([id, idVisitaDeGasto(id), idEventoDeGasto(id)]).size).toBe(3);
  });
});

describe('datosEventoGasto', () => {
  const g = { concepto: ' Cena ', categoria: 'eating_out' as const, fecha: '2026-11-10', privado: false };
  it('compartido, todo el día, sin preguntar quién pagó', () => {
    expect(datosEventoGasto(g, 'm1')).toMatchObject({ title: 'Cena', all_day: true, attendees: 'both', is_secret: false, ask_who_paid: false, category: 'eating_out', place_id: null });
  });
  it('privado: secreto y de quien lo crea; sin concepto usa la categoría; mapeo de categoría', () => {
    expect(datosEventoGasto({ ...g, privado: true }, 'm2')).toMatchObject({ is_secret: true, attendees: 'm2' });
    expect(datosEventoGasto({ ...g, concepto: ' ', categoria: 'leisure' }, 'm1')).toMatchObject({ title: 'Ocio', category: 'leisure' });
    expect(datosEventoGasto({ ...g, categoria: 'other' }, 'm1').category).toBe('other');
  });
});
