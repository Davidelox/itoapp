/**
 * «¿Quién pagó?» de un evento (docs/plan-calendario.md §2 y §4): valores iniciales del gasto, fase del bloque
 * del detalle y textos. Sin red ni React: todo se puede probar.
 */
import type { Asistentes, CategoriaEvento, Evento, Hueco } from '@/lib/calendario/evento';
import { formatearEuros } from '@/lib/dinero/importe';
import type { Categoria } from '@/lib/gastos/categorias';
import type { AjustesGastos, DatosGasto } from '@/lib/gastos/consultas';
import { horaEnZona } from '@/lib/gastos/fechas';
import {
  type Pagador,
  type Reparto,
  aDatos,
  fraseResultado,
  ocultaProporcional,
  puedeSerPrivado,
  sinProporcionalOculto,
  valoresPorDefecto,
} from '@/lib/gastos/reparto';

/** Categoría con la que se apunta el gasto de un evento sin categoría propia (la persona la puede cambiar). */
export const CATEGORIA_EVENTO: Categoria = 'eating_out';

/**
 * Categoría de gasto según la del evento: comer fuera → Comer fuera; ocio y viaje → Ocio; el resto, la de
 * siempre (Comer fuera). Un cumpleaños no pregunta «¿Quién pagó?», pero por si acaso cae en el resto.
 */
export function categoriaGastoDe(categoria: CategoriaEvento | null | undefined): Categoria {
  return categoria === 'leisure' || categoria === 'trip' ? 'leisure' : CATEGORIA_EVENTO;
}

/** Solo se pregunta (y solo se apunta) a quien va: `both` o el hueco de quien mira. */
export const vaAlEvento = (asistentes: Asistentes, yo: Hueco): boolean => asistentes === 'both' || asistentes === yo;

/** Lo que hace falta de un evento para apuntar su gasto. `fecha` es la del día concreto (en eventos repetidos, la repetición). */
export type EventoParaGasto = Pick<Evento, 'id' | 'title' | 'budget_cents' | 'is_secret'> & { fecha: string; category?: CategoriaEvento };

export type ValoresGasto = {
  /** Texto editable («60,00»); vacío si el evento no tiene presupuesto. */
  importe: string;
  categoria: Categoria;
  concepto: string;
  fecha: string;
  pagador: Pagador;
  reparto: Reparto;
  visible: boolean;
};

/** Céntimos → texto editable: 6000 → «60,00». */
export const importeATexto = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

/**
 * Valores iniciales de la hoja. Importe = presupuesto, concepto = título, fecha = la del evento (o hoy, si aún
 * no ha llegado: un gasto no tiene fecha futura), categoría «Comer fuera» y pagador/reparto de los ajustes de
 * la pareja. Un evento SECRETO empieza como «Pagaste tú · Solo tú · No visible» (decisión 6): si el gasto se
 * compartiera, la pareja vería el gasto y su concepto, que es el título del secreto.
 */
export function valoresIniciales(evento: EventoParaGasto, ajustes: AjustesGastos, hoy: string): ValoresGasto {
  const categoria = categoriaGastoDe(evento.category);
  const base = evento.is_secret
    ? { pagador: 'yo' as const, reparto: 'solo_yo' as const }
    : valoresPorDefecto(ajustes, categoria);
  const reparto = sinProporcionalOculto(base.reparto, ocultaProporcional(ajustes.pctProporcionalM1, false));
  return {
    importe: evento.budget_cents === null ? '' : importeATexto(evento.budget_cents),
    categoria,
    concepto: evento.title,
    fecha: evento.fecha < hoy ? evento.fecha : hoy,
    pagador: base.pagador,
    reparto,
    visible: evento.is_secret ? false : ajustes.compartirPersonales,
  };
}

export type EntradaGasto = {
  eventoId: string;
  cents: number;
  concepto: string;
  categoria: Categoria;
  fecha: string;
  yo: Hueco;
  pagador: Pagador;
  reparto: Reparto;
  pctYo: number;
  pctProporcionalM1: number;
  visible: boolean;
};

/**
 * Lo que se envía al crear el gasto. Solo un gasto pagado por ti y solo tuyo puede ser privado (CHECK de
 * `expenses`): en cualquier otro caso `visible_to_partner` es true, diga lo que diga el interruptor.
 */
export function datosGasto(e: EntradaGasto): DatosGasto {
  const datos = aDatos(e.yo, e.pagador, e.reparto, e.pctYo, e.pctProporcionalM1);
  return {
    concept: e.concepto.trim(),
    amount_cents: e.cents,
    category: e.categoria,
    spent_on: e.fecha,
    ...datos,
    visible_to_partner: puedeSerPrivado(e.pagador, e.reparto) ? e.visible : true,
    event_id: e.eventoId,
  };
}

/** Frase de la hoja de un evento secreto mientras el gasto es privado. */
export const textoSecretoPrivado = (nombrePareja: string) => `Pagaste tú · Solo tú · No visible para ${nombrePareja}`;

/** Aviso de la hoja de un evento secreto cuando el gasto sí se va a ver (decisión 6). */
export const avisoSecretoCompartido = (nombrePareja: string) => `${nombrePareja} verá el gasto y su concepto, no el evento.`;

export type FaseQuienPago = 'antes' | 'despues' | 'resuelto';

/**
 * Fase del bloque «Después del evento»: resuelto (hay gasto o se descartó), antes de terminar o después. Usa
 * `ends_at`, que calcula el servidor con la zona de la pareja (sin hora de fin son +90 min; todo el día acaba a las 24:00).
 */
export function faseQuienPago(e: Pick<Evento, 'ends_at' | 'who_paid_resolved_at'>, ahora: Date = new Date()): FaseQuienPago {
  if (e.who_paid_resolved_at) return 'resuelto';
  return new Date(e.ends_at).getTime() <= ahora.getTime() ? 'despues' : 'antes';
}

/** «~60 €»: el presupuesto aproximado, sin decimales si son cero. */
export const textoPresupuesto = (cents: number) => `~${formatearEuros(cents)}`;

/**
 * Antes de terminar: «Presupuesto ~60 €. A partir de las 23:00 os preguntaremos quién pagó.» La hora es la del
 * fin del evento en la zona de la pareja. `plural`: van los dos y la pareja está unida («os» / «te»).
 */
export function textoAntes(e: Pick<Evento, 'budget_cents' | 'ends_at'> & { all_day?: boolean }, plural: boolean): string {
  const presupuesto = e.budget_cents === null ? '' : `Presupuesto ${textoPresupuesto(e.budget_cents)}. `;
  // Uno de todo el día acaba a las 24:00: «a partir de las 00:00» confunde.
  const cuando = e.all_day ? 'Al acabar el día' : `A partir de las ${horaEnZona(e.ends_at)}`;
  return `${presupuesto}${cuando} ${plural ? 'os' : 'te'} preguntaremos quién pagó.`;
}

type PartesGasto = { paid_by: 'm1' | 'm2' | 'pot'; share_m1_cents: number; share_m2_cents: number; share_pot_cents: number };

/** Resuelto con gasto: «Gasto guardado · Meri te debe 30,00 €» (sin deuda, solo «Gasto guardado»). */
export function textoGastoGuardado(g: PartesGasto, yo: Hueco, nombrePareja: string): string {
  const r = fraseResultado(
    yo,
    g.paid_by,
    { m1: g.share_m1_cents, m2: g.share_m2_cents, pot: g.share_pot_cents },
    nombrePareja,
    'presente',
  );
  return r.quien === 'nadie' ? 'Gasto guardado' : `Gasto guardado · ${r.texto}`;
}

/** «ayer · ~60 €»: segunda línea de la tarjeta «¿Quién pagó?» (la fecha ya viene como «Ayer», «Hoy», «Sáb 7 nov»). */
export function lineaQuienPago(fechaCorta: string, budgetCents: number | null): string {
  const fecha = fechaCorta.charAt(0).toLowerCase() + fechaCorta.slice(1);
  return budgetCents === null ? fecha : `${fecha} · ${textoPresupuesto(budgetCents)}`;
}
