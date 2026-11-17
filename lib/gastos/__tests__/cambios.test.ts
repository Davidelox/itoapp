import { soloCambios } from '@/lib/gastos/cambios';

describe('soloCambios', () => {
  const guardado = { concept: 'Cena', amount_cents: 6200, split_mode: 'proportional', split_pct_m1: 60, version: 3 };
  it('solo el concepto cambiado: no se envían ni el importe ni el reparto', () => {
    expect(soloCambios(guardado, { concept: 'Cena con Marta', amount_cents: 6200, split_mode: 'proportional', split_pct_m1: 60 })).toEqual({
      concept: 'Cena con Marta',
    });
  });
  it('sin cambios: objeto vacío', () => {
    expect(soloCambios(guardado, { concept: 'Cena', amount_cents: 6200 })).toEqual({});
  });
  it('null distinto de un número', () => {
    expect(soloCambios(guardado, { split_pct_m1: null })).toEqual({ split_pct_m1: null });
  });
});
