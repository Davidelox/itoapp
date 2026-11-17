import {
  aDatos,
  deDatos,
  efecto,
  fraseResultado,
  partes,
  partesDeYo,
  puedeSerPrivado,
  valoresPorDefecto,
} from '@/lib/gastos/reparto';

const n = (s: string) => s.replace(/\u00a0/g, ' ');

describe('partes (misma regla que private.compute_shares)', () => {
  it('62,00 € a medias → 31,00 / 31,00', () => {
    expect(partes(6200, 'half', 50)).toEqual({ m1: 3100, m2: 3100, pot: 0 });
  });
  it('0,01 € a medias: m1 se lleva el céntimo (mitades hacia arriba)', () => {
    expect(partes(1, 'half', 50)).toEqual({ m1: 1, m2: 0, pot: 0 });
  });
  it('0,03 € proporcional 60/40 → 0,02 / 0,01', () => {
    expect(partes(3, 'proportional', 60)).toEqual({ m1: 2, m2: 1, pot: 0 });
  });
  it('10,00 € al 33 % → 3,30 / 6,70', () => {
    expect(partes(1000, 'custom', 33)).toEqual({ m1: 330, m2: 670, pot: 0 });
  });
  it('las partes suman siempre el total', () => {
    for (const total of [1, 7, 99, 101, 12345, 99999]) {
      for (const pct of [0, 1, 33, 50, 67, 99, 100]) {
        const p = partes(total, 'custom', pct);
        expect(p.m1 + p.m2 + p.pot).toBe(total);
        expect(p.m1).toBeGreaterThanOrEqual(0);
        expect(p.m2).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it('a medias ignora el porcentaje', () => {
    expect(partes(100, 'half', 80)).toEqual({ m1: 50, m2: 50, pot: 0 });
  });
  it('solo uno y del bote', () => {
    expect(partes(500, 'only_m1', null)).toEqual({ m1: 500, m2: 0, pot: 0 });
    expect(partes(500, 'only_m2', null)).toEqual({ m1: 0, m2: 500, pot: 0 });
    expect(partes(500, 'pot', null)).toEqual({ m1: 0, m2: 0, pot: 500 });
  });
});

describe('aDatos / deDatos: «tú» y «tu pareja» ↔ m1 y m2', () => {
  it('m1 pagó a medias', () => {
    expect(aDatos('m1', 'yo', 'medias', 50, 60)).toEqual({ paid_by: 'm1', split_mode: 'half', split_pct_m1: 50 });
  });
  it('m2 elige «Solo tú» → only_m2', () => {
    expect(aDatos('m2', 'yo', 'solo_yo', 50, 60)).toEqual({ paid_by: 'm2', split_mode: 'only_m2', split_pct_m1: null });
  });
  it('m2 elige «Solo tu pareja» → only_m1', () => {
    expect(aDatos('m2', 'pareja', 'solo_pareja', 50, 60).split_mode).toBe('only_m1');
  });
  it('m2 personalizado «tú 70 %» → split_pct_m1 = 30', () => {
    expect(aDatos('m2', 'yo', 'personalizado', 70, 60)).toEqual({ paid_by: 'm2', split_mode: 'custom', split_pct_m1: 30 });
  });
  it('proporcional usa el % de los ajustes (de m1)', () => {
    expect(aDatos('m2', 'pareja', 'proporcional', 50, 60)).toEqual({ paid_by: 'm1', split_mode: 'proportional', split_pct_m1: 60 });
  });
  it('del bote pagado por el bote', () => {
    expect(aDatos('m1', 'bote', 'bote', 50, 60)).toEqual({ paid_by: 'pot', split_mode: 'pot', split_pct_m1: null });
  });
  it('ida y vuelta desde los dos lados', () => {
    const casos = [
      ['yo', 'medias', 50],
      ['pareja', 'personalizado', 70],
      ['yo', 'solo_yo', 50],
      ['pareja', 'solo_pareja', 50],
      ['bote', 'bote', 50],
      ['yo', 'bote', 50],
    ] as const;
    for (const yo of ['m1', 'm2'] as const) {
      for (const [pagador, reparto, pct] of casos) {
        expect(deDatos(yo, aDatos(yo, pagador, reparto, pct, 60))).toEqual({ pagador, reparto, pctYo: pct });
      }
    }
  });
  it('m2 ve el proporcional 60/40 de los ajustes como «tú 40 %»', () => {
    expect(deDatos('m2', { paid_by: 'm1', split_mode: 'proportional', split_pct_m1: 60 }).pctYo).toBe(40);
  });
});

describe('efecto y frase del resultado', () => {
  it('m1 pagó 62 € a medias: la pareja le debe 31 €; visto por m2, debe 31 €', () => {
    const p = partes(6200, 'half', 50);
    expect(efecto('m1', 'm1', p).parejaMeDebe).toBe(3100);
    expect(efecto('m2', 'm1', p).parejaMeDebe).toBe(-3100);
    expect(n(fraseResultado('m1', 'm1', p, 'Meri', 'futuro').texto)).toBe('Meri te deberá 31,00 €');
    expect(n(fraseResultado('m2', 'm1', p, 'David', 'presente').texto)).toBe('Debes 31,00 € a David');
  });
  it('m2 pagó algo solo de m1: m1 debe todo', () => {
    const p = partes(1800, 'only_m1', null);
    expect(efecto('m1', 'm2', p).parejaMeDebe).toBe(-1800);
  });
  it('gasto solo tuyo y pagado por ti: sin deuda', () => {
    const p = partes(1000, 'only_m1', null);
    expect(efecto('m1', 'm1', p).parejaMeDebe).toBe(0);
    expect(n(fraseResultado('m1', 'm1', p, 'Meri', 'futuro').texto)).toBe('Gasto solo tuyo. No genera deuda');
  });
  it('del bote pagado por ti: el bote te debe, sin deuda entre los dos', () => {
    const p = partes(5430, 'pot', null);
    const e = efecto('m2', 'm2', p);
    expect(e).toEqual({ parejaMeDebe: 0, boteMeDebe: 5430, boteLeDebe: 0 });
    expect(n(fraseResultado('m2', 'm2', p, 'David', 'futuro').texto)).toBe('El bote te deberá 54,30 €');
    expect(n(fraseResultado('m1', 'm2', p, 'Meri', 'futuro').texto)).toBe('El bote le deberá 54,30 € a Meri');
  });
  it('pagado por el bote: nunca hay deuda entre los dos', () => {
    const p = partes(1000, 'only_m1', null);
    expect(efecto('m1', 'pot', p).parejaMeDebe).toBe(0);
    expect(n(fraseResultado('m1', 'pot', partes(1000, 'pot', null), 'Meri', 'futuro').texto)).toBe('Sale del bote común. Sin deudas');
  });
  it('sin importe', () => {
    expect(fraseResultado('m1', 'm1', partes(0, 'half', 50), 'Meri', 'futuro').quien).toBe('nadie');
  });
});

describe('valores por defecto según los ajustes', () => {
  const base = { boteActivo: true, categoriasBote: ['home', 'groceries', 'subscriptions'] as const };
  it('mixto con Súper → del bote y pagado por el bote', () => {
    expect(valoresPorDefecto({ ...base, categoriasBote: [...base.categoriasBote], reparto: 'mixed' }, 'groceries')).toEqual({
      pagador: 'bote',
      reparto: 'bote',
    });
  });
  it('mixto con Comer fuera → a medias, pagaste tú', () => {
    expect(valoresPorDefecto({ ...base, categoriasBote: [...base.categoriasBote], reparto: 'mixed' }, 'eating_out')).toEqual({
      pagador: 'yo',
      reparto: 'medias',
    });
  });
  it('sin bote nunca propone el bote', () => {
    expect(valoresPorDefecto({ boteActivo: false, categoriasBote: [], reparto: 'mixed' }, 'groceries')).toEqual({
      pagador: 'yo',
      reparto: 'medias',
    });
  });
  it('proporcional', () => {
    expect(valoresPorDefecto({ boteActivo: false, categoriasBote: [], reparto: 'proportional' }, null).reparto).toBe('proporcional');
  });
});

describe('privacidad', () => {
  it('solo puede ser privado lo pagado por ti y solo tuyo', () => {
    expect(puedeSerPrivado('yo', 'solo_yo')).toBe(true);
    expect(puedeSerPrivado('pareja', 'solo_yo')).toBe(false);
    expect(puedeSerPrivado('yo', 'medias')).toBe(false);
  });
});

describe('partesDeYo', () => {
  it('m2 ve su parte como «yo»', () => {
    expect(partesDeYo('m2', { m1: 330, m2: 670, pot: 0 })).toEqual({ yo: 670, pareja: 330, bote: 0 });
  });
});

describe('revisión del arquitecto', () => {
  it('personalizado al 0 % y al 100 %', () => {
    expect(partes(999, 'custom', 0)).toEqual({ m1: 0, m2: 999, pot: 0 });
    expect(partes(999, 'custom', 100)).toEqual({ m1: 999, m2: 0, pot: 0 });
  });
  it('importes altos sin desbordar: 1.000.000 € al 80 %', () => {
    expect(partes(100_000_000, 'custom', 80)).toEqual({ m1: 80_000_000, m2: 20_000_000, pot: 0 });
  });
  it('editar un proporcional con otros ajustes conserva su %: se envía el % original', () => {
    // Gasto guardado en 60/40; los ajustes pasan a 70/30. El formulario usa el 60 del gasto.
    expect(aDatos('m1', 'yo', 'proporcional', 50, 60).split_pct_m1).toBe(60);
  });
});
