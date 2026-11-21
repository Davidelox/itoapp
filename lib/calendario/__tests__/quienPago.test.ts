import type { Evento } from '@/lib/calendario/evento';
import {
  type EventoParaGasto,
  avisoSecretoCompartido,
  categoriaGastoDe,
  datosGasto,
  faseQuienPago,
  importeATexto,
  lineaQuienPago,
  textoAntes,
  textoGastoGuardado,
  textoPresupuesto,
  textoSecretoPrivado,
  vaAlEvento,
  valoresIniciales,
} from '@/lib/calendario/quienPago';
import type { AjustesGastos } from '@/lib/gastos/consultas';
import { fijarZonaHoraria } from '@/lib/gastos/fechas';

const ajustes: AjustesGastos = {
  reparto: 'half',
  boteActivo: false,
  categoriasBote: [],
  pctProporcionalM1: 50,
  compartirPersonales: false,
  compartirRecurrentes: false,
};
const evento: EventoParaGasto = { id: 'e1', title: 'Cena en Taberna El Olivo', budget_cents: 6000, is_secret: false, fecha: '2026-11-20' };

afterEach(() => fijarZonaHoraria(null));

describe('vaAlEvento', () => {
  it('solo si van los dos o va tu hueco', () => {
    expect(vaAlEvento('both', 'm1')).toBe(true);
    expect(vaAlEvento('m1', 'm1')).toBe(true);
    expect(vaAlEvento('m2', 'm1')).toBe(false);
    expect(vaAlEvento('m1', 'm2')).toBe(false);
  });
});

describe('categoriaGastoDe', () => {
  it('comer fuera → Comer fuera; ocio y viaje → Ocio; el resto, lo de siempre (Comer fuera)', () => {
    expect(categoriaGastoDe('eating_out')).toBe('eating_out');
    expect(categoriaGastoDe('leisure')).toBe('leisure');
    expect(categoriaGastoDe('trip')).toBe('leisure');
    expect(categoriaGastoDe('other')).toBe('eating_out');
    expect(categoriaGastoDe('birthday')).toBe('eating_out');
    expect(categoriaGastoDe(undefined)).toBe('eating_out');
  });
  it('el gasto del evento empieza con la categoría del evento', () => {
    expect(valoresIniciales({ ...evento, category: 'trip' }, ajustes, '2026-11-21').categoria).toBe('leisure');
    expect(valoresIniciales({ ...evento, category: 'eating_out' }, ajustes, '2026-11-21').categoria).toBe('eating_out');
    expect(valoresIniciales(evento, ajustes, '2026-11-21').categoria).toBe('eating_out');
  });
});

describe('valoresIniciales', () => {
  it('importe = presupuesto, concepto = título, categoría «Comer fuera» y reparto de los ajustes', () => {
    const v = valoresIniciales(evento, ajustes, '2026-11-21');
    expect(v).toEqual({
      importe: '60,00',
      categoria: 'eating_out',
      concepto: 'Cena en Taberna El Olivo',
      fecha: '2026-11-20',
      pagador: 'yo',
      reparto: 'medias',
      visible: false,
    });
  });
  it('sin presupuesto, importe vacío', () => {
    expect(valoresIniciales({ ...evento, budget_cents: null }, ajustes, '2026-11-21').importe).toBe('');
  });
  it('fecha = mín(evento, hoy): un evento futuro se apunta hoy', () => {
    expect(valoresIniciales({ ...evento, fecha: '2026-12-01' }, ajustes, '2026-11-21').fecha).toBe('2026-11-21');
    expect(valoresIniciales({ ...evento, fecha: '2026-11-21' }, ajustes, '2026-11-21').fecha).toBe('2026-11-21');
  });
  it('usa el pagador y el reparto por defecto de los ajustes (bote, proporcional)', () => {
    const bote = { ...ajustes, reparto: 'all_pot' as const, boteActivo: true };
    expect(valoresIniciales(evento, bote, '2026-11-21')).toMatchObject({ pagador: 'bote', reparto: 'bote' });
    const prop = { ...ajustes, reparto: 'proportional' as const, pctProporcionalM1: 60 };
    expect(valoresIniciales(evento, prop, '2026-11-21')).toMatchObject({ pagador: 'yo', reparto: 'proporcional' });
  });
  it('con proporcional 50/50 (chip oculto) el reparto pasa a «a medias»', () => {
    const prop = { ...ajustes, reparto: 'proportional' as const, pctProporcionalM1: 50 };
    expect(valoresIniciales(evento, prop, '2026-11-21').reparto).toBe('medias');
  });
  it('«Visible para tu pareja» parte del ajuste de la persona en un evento normal', () => {
    expect(valoresIniciales(evento, { ...ajustes, compartirPersonales: true }, '2026-11-21').visible).toBe(true);
  });
  it('un evento secreto parte como «Pagaste tú · Solo tú · No visible», aunque los ajustes digan otra cosa', () => {
    const bote = { ...ajustes, reparto: 'all_pot' as const, boteActivo: true, compartirPersonales: true };
    expect(valoresIniciales({ ...evento, is_secret: true }, bote, '2026-11-21')).toMatchObject({
      pagador: 'yo',
      reparto: 'solo_yo',
      visible: false,
    });
  });
});

describe('datosGasto', () => {
  const base = {
    eventoId: 'e1',
    cents: 6200,
    concepto: ' Cena ',
    categoria: 'eating_out' as const,
    fecha: '2026-11-20',
    yo: 'm1' as const,
    pagador: 'yo' as const,
    reparto: 'medias' as const,
    pctYo: 50,
    pctProporcionalM1: 50,
    visible: false,
  };
  it('enlaza el evento y recorta el concepto', () => {
    expect(datosGasto(base)).toEqual({
      concept: 'Cena',
      amount_cents: 6200,
      category: 'eating_out',
      spent_on: '2026-11-20',
      paid_by: 'm1',
      split_mode: 'half',
      split_pct_m1: 50,
      visible_to_partner: true,
      event_id: 'e1',
    });
  });
  it('solo «pagaste tú · solo tú» puede ser privado', () => {
    expect(datosGasto({ ...base, reparto: 'solo_yo' }).visible_to_partner).toBe(false);
    expect(datosGasto({ ...base, reparto: 'solo_yo', visible: true }).visible_to_partner).toBe(true);
    expect(datosGasto({ ...base, pagador: 'pareja', reparto: 'solo_yo' }).visible_to_partner).toBe(true);
  });
  it('reparto personalizado visto desde m2', () => {
    const d = datosGasto({ ...base, yo: 'm2', reparto: 'personalizado', pctYo: 30 });
    expect(d).toMatchObject({ paid_by: 'm2', split_mode: 'custom', split_pct_m1: 70 });
  });
});

describe('fase del bloque', () => {
  const e = { ends_at: '2026-11-20T22:00:00Z', who_paid_resolved_at: null };
  it('antes, después y resuelto', () => {
    expect(faseQuienPago(e, new Date('2026-11-20T21:59:00Z'))).toBe('antes');
    expect(faseQuienPago(e, new Date('2026-11-20T22:00:00Z'))).toBe('despues');
    expect(faseQuienPago(e, new Date('2026-11-21T10:00:00Z'))).toBe('despues');
    expect(faseQuienPago({ ...e, who_paid_resolved_at: '2026-11-20T23:00:00Z' }, new Date('2026-11-20T21:00:00Z'))).toBe('resuelto');
  });
});

describe('textos', () => {
  const fin = { budget_cents: 6000 as number | null, ends_at: '2026-11-20T22:00:00Z' };
  it('antes de terminar: presupuesto y hora de fin en la zona de la pareja', () => {
    fijarZonaHoraria('Europe/Madrid');
    expect(textoAntes(fin, true)).toBe(`Presupuesto ${textoPresupuesto(6000)}. A partir de las 23:00 os preguntaremos quién pagó.`);
    expect(textoAntes(fin, false)).toContain('te preguntaremos');
    fijarZonaHoraria('Atlantic/Canary');
    expect(textoAntes(fin, true)).toContain('A partir de las 22:00');
  });
  it('sin presupuesto no hay frase de presupuesto', () => {
    fijarZonaHoraria('Europe/Madrid');
    expect(textoAntes({ ...fin, budget_cents: null }, true)).toBe('A partir de las 23:00 os preguntaremos quién pagó.');
  });
  it('todo el día: al acabar el día (no «a partir de las 00:00»)', () => {
    fijarZonaHoraria('Europe/Madrid');
    expect(textoAntes({ ...fin, budget_cents: null, all_day: true }, false)).toBe('Al acabar el día te preguntaremos quién pagó.');
  });
  it('presupuesto aproximado', () => {
    expect(textoPresupuesto(6000)).toMatch(/^~60\s€$/);
    expect(textoPresupuesto(6050)).toMatch(/^~60,50\s€$/);
  });
  it('gasto guardado: quién debe qué', () => {
    const g = { paid_by: 'm1' as const, share_m1_cents: 3000, share_m2_cents: 3000, share_pot_cents: 0 };
    expect(textoGastoGuardado(g, 'm1', 'Meri')).toMatch(/^Gasto guardado · Meri te debe 30,00\s€$/);
    expect(textoGastoGuardado({ ...g, paid_by: 'm2' }, 'm1', 'Meri')).toMatch(/^Gasto guardado · Debes 30,00\s€ a Meri$/);
    const solo = { paid_by: 'm1' as const, share_m1_cents: 6000, share_m2_cents: 0, share_pot_cents: 0 };
    expect(textoGastoGuardado(solo, 'm1', 'Meri')).toBe('Gasto guardado');
  });
  it('línea de la tarjeta', () => {
    expect(lineaQuienPago('Ayer', 6000)).toMatch(/^ayer · ~60\s€$/);
    expect(lineaQuienPago('Sáb 7 nov', null)).toBe('sáb 7 nov');
  });
  it('importe editable y textos de secreto', () => {
    expect(importeATexto(6050)).toBe('60,50');
    expect(textoSecretoPrivado('Meri')).toBe('Pagaste tú · Solo tú · No visible para Meri');
    expect(avisoSecretoCompartido('Meri')).toBe('Meri verá el gasto y su concepto, no el evento.');
  });
});

// El tipo Evento sigue siendo el que consume la fase: si cambia, este test deja de compilar.
const _comprobacion: Pick<Evento, 'ends_at' | 'who_paid_resolved_at'> = { ends_at: '', who_paid_resolved_at: null };
void _comprobacion;

describe('presupuestos apagados', () => {
  it('lineaQuienPago y textoAntes no dicen el presupuesto', () => {
    expect(lineaQuienPago('Ayer', 6000, false)).toBe('ayer');
    expect(textoAntes({ budget_cents: 6000, ends_at: '2026-11-20T22:00:00Z' }, true, false)).not.toMatch(/Presupuesto/);
  });
});
