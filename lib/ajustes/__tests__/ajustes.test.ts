import {
  type FilaAjustes,
  cambiosBote,
  diferencias,
  incoherencia,
  listaCategorias,
  resumenBote,
  resumenReparto,
  textoPorcentaje,
  textosCambios,
} from '@/lib/ajustes/ajustes';

const nb = (s: string) => s.replace(/ /g, ' ');

const base: FilaAjustes = {
  default_split: 'mixed',
  proportional_pct_m1: 60,
  pot_enabled: true,
  pot_categories: ['home', 'groceries', 'subscriptions'],
  pot_funding: 'monthly',
  pot_monthly_cents: 100000,
  pot_day: 1,
  pot_pct_m1: 50,
};

describe('diferencias', () => {
  it('solo devuelve lo que cambia', () => {
    expect(diferencias(base, { ...base, pot_day: 5 })).toEqual({ pot_day: 5 });
  });
  it('las categorías no dependen del orden', () => {
    expect(diferencias(base, { ...base, pot_categories: ['subscriptions', 'home', 'groceries'] })).toEqual({});
  });
});

describe('incoherencia', () => {
  it('sin bote no hay Mixto', () => {
    expect(incoherencia({ ...base, pot_enabled: false })).toMatch(/Mixto/);
  });
  it('mensual sin importe', () => {
    expect(incoherencia({ ...base, pot_monthly_cents: null })).toMatch(/importe/);
  });
  it('lo normal es coherente', () => {
    expect(incoherencia(base)).toBeNull();
  });
});

describe('cambiosBote', () => {
  it('desactivar con Mixto pasa el reparto a A medias', () => {
    expect(cambiosBote(base, { activo: false, mensual: true, aportacionCents: null, dia: null, pctM1: 50 })).toEqual({
      pot_enabled: false,
      default_split: 'half',
    });
  });
  it('desactivar con Proporcional deja el reparto', () => {
    const prop = { ...base, default_split: 'proportional' as const };
    expect(cambiosBote(prop, { activo: false, mensual: true, aportacionCents: null, dia: null, pctM1: 50 })).toEqual({
      pot_enabled: false,
    });
  });
  it('pasar a mano conserva importe y día', () => {
    expect(cambiosBote(base, { activo: true, mensual: false, aportacionCents: null, dia: null, pctM1: 50 })).toEqual({
      pot_funding: 'manual',
    });
  });
  it('subir la aportación', () => {
    expect(cambiosBote(base, { activo: true, mensual: true, aportacionCents: 120000, dia: 1, pctM1: 60 })).toEqual({
      pot_monthly_cents: 120000,
      pot_pct_m1: 60,
    });
  });
});

describe('textos', () => {
  it('porcentaje desde cada persona', () => {
    expect(nb(textoPorcentaje(60, 'm1', 'Meri'))).toBe('Tú 60 % · Meri 40 %');
    expect(nb(textoPorcentaje(60, 'm2', 'David'))).toBe('Tú 40 % · David 60 %');
    expect(textoPorcentaje(50, 'm2', 'David')).toBe('A medias');
  });
  it('resúmenes de las filas', () => {
    expect(resumenReparto(base, 'm1', 'Meri')).toBe('Mixto');
    expect(nb(resumenReparto({ ...base, default_split: 'proportional' }, 'm2', 'David'))).toBe('Proporcional · Tú 40 % · David 60 %');
    expect(nb(resumenBote(base))).toMatch(/^1.?000 € al mes, el día 1$/);
    expect(resumenBote({ ...base, pot_funding: 'manual' })).toBe('Se rellena a mano');
    expect(resumenBote({ ...base, pot_enabled: false })).toBe('Sin bote común');
  });
  it('lista de categorías', () => {
    expect(listaCategorias(['subscriptions', 'home', 'groceries'])).toBe('Hogar, Súper y Suscripciones');
    expect(listaCategorias([])).toBe('Ninguna');
  });
  it('una línea por cambio', () => {
    const lineas = textosCambios(base, { pot_monthly_cents: 120000, pot_day: 5 }, 'm1', 'Meri').map(nb);
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toMatch(/^Aportación al bote: 1.?000 € → 1.?200 € al mes$/);
    expect(lineas[1]).toBe('Día de la aportación: 1 → 5');
  });
  it('desactivar el bote', () => {
    expect(textosCambios(base, { pot_enabled: false, default_split: 'half' }, 'm1', 'Meri')).toEqual([
      'Desactivar el bote común',
      'Reparto de los gastos: Mixto → A medias',
    ]);
  });
  it('categorías que entran y salen', () => {
    expect(textosCambios(base, { pot_categories: ['home', 'groceries', 'leisure'] }, 'm1', 'Meri')).toEqual([
      'Ocio pasa al bote',
      'Suscripciones deja el bote',
    ]);
  });
  it('lo que ya está igual no sale', () => {
    expect(textosCambios(base, { pot_day: 1 }, 'm1', 'Meri')).toEqual([]);
  });
});
