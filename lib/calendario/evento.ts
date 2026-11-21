/**
 * Eventos del calendario (docs/plan-calendario.md §2 y §4): el formulario, la fila de `events`, los avisos
 * (`reminder_minutes`) y los textos del detalle. Sin red ni React: todo se puede probar.
 *
 * Nunca se envían `time_zone`, `created_by`, `starts_at` ni `ends_at` (los pone el servidor), ni `plan_id`
 * (llega con el Planificador): un evento de esta pantalla no va en un plan, así que un secreto cumple siempre el
 * CHECK `not (is_secret and plan_id is not null)`. `place_id` es el sitio del Mapa (opcional).
 */
import { vaAlEvento } from '@/lib/calendario/quienPago';
import { type Repeticion, edad, esBisiesto, proximaRepeticion, textoCorto } from '@/lib/calendario/repeticion';
import { DIAS_SEMANA, diaCorto, diaMesCorto, diasEntre, sumarDias } from '@/lib/calendario/rejilla';
import { leerEuros } from '@/lib/dinero/importe';
import { deISO, fechaLarga } from '@/lib/gastos/fechas';

export type Asistentes = 'both' | 'm1' | 'm2';
export type Hueco = 'm1' | 'm2';

/** Mismo CHECK que `events.category`. El cumpleaños es una categoría más (docs/plan-calendario-v2.md §3). */
export type CategoriaEvento = 'trip' | 'eating_out' | 'leisure' | 'birthday' | 'other';
export const CATEGORIAS_VALIDAS: CategoriaEvento[] = ['trip', 'eating_out', 'leisure', 'birthday', 'other'];

/** Iconos de Ionicons que usa el calendario (los de las categorías de gasto y el de pagos). */
export type IconoCalendario = 'airplane-outline' | 'restaurant-outline' | 'ticket-outline' | 'gift-outline' | 'card-outline';

export const INFO_CATEGORIA_EVENTO: Record<CategoriaEvento, { etiqueta: string; icono: IconoCalendario | null }> = {
  trip: { etiqueta: 'Viaje', icono: 'airplane-outline' },
  eating_out: { etiqueta: 'Comer fuera', icono: 'restaurant-outline' },
  leisure: { etiqueta: 'Ocio', icono: 'ticket-outline' },
  birthday: { etiqueta: 'Cumpleaños', icono: 'gift-outline' },
  other: { etiqueta: 'Evento', icono: null },
};

/** Categorías que se eligen en un evento normal (el cumpleaños tiene su propio formulario). «Otros» es la de por defecto. */
export const CATEGORIAS_FORMULARIO: { valor: CategoriaEvento; etiqueta: string; icono: IconoCalendario | null }[] = [
  { valor: 'trip', etiqueta: 'Viaje', icono: 'airplane-outline' },
  { valor: 'eating_out', etiqueta: 'Comer fuera', icono: 'restaurant-outline' },
  { valor: 'leisure', etiqueta: 'Ocio', icono: 'ticket-outline' },
  { valor: 'other', etiqueta: 'Otros', icono: null },
];

/** Un evento de varios días dura como mucho 31 días (CHECK `events_varios_dias`). */
export const MAX_DIAS_VARIOS = 31;
/** Año ancla de un cumpleaños: bisiesto, para poder guardar el 29 de febrero (CHECK `events_cumple`). */
export const ANIO_ANCLA_CUMPLE = 2000;

/** Fila de `events` tal como la usa la app (`start_time` ya en `HH:MM`). */
export type Evento = {
  id: string;
  title: string;
  start_date: string;
  start_time: string | null;
  all_day: boolean;
  recurrence: Repeticion;
  /** Último día de un evento de varios días; null si dura uno. */
  end_date: string | null;
  attendees: Asistentes;
  budget_cents: number | null;
  ask_who_paid: boolean;
  who_paid_resolved_at: string | null;
  reminder_minutes: number | null;
  notes: string | null;
  is_secret: boolean;
  category: CategoriaEvento;
  /** Cumpleaños: año de nacimiento, si se puso. */
  birth_year: number | null;
  /** Sitio del Mapa enlazado; null si no hay o se borró. */
  place_id: string | null;
  /** Reserva hecha (mesa, hotel…) y su nota («a nombre de David, 21:30»). */
  reserved: boolean;
  reservation_note: string | null;
  created_by: string | null;
  version: number;
  starts_at: string;
  ends_at: string;
};

/** Columnas de `events` que lee la app (la fila completa de `Evento`, sin `time_zone`, `plan_id`, etc.). */
export const COLUMNAS_EVENTO =
  'id, title, start_date, start_time, end_date, all_day, recurrence, attendees, budget_cents, ask_who_paid, who_paid_resolved_at, reminder_minutes, notes, is_secret, category, birth_year, place_id, reserved, reservation_note, created_by, version, starts_at, ends_at';

/** `start_time` llega como `HH:MM:SS`. */
export type FilaEvento = Omit<Evento, 'start_time'> & { start_time: string | null };

/** Lo que se guarda al editar. Al crear se añade `is_secret` (no se puede cambiar después, solo revelar). */
export type DatosEvento = {
  title: string;
  start_date: string;
  start_time: string | null;
  end_date: string | null;
  all_day: boolean;
  recurrence: Repeticion;
  attendees: Asistentes;
  budget_cents: number | null;
  ask_who_paid: boolean;
  reminder_minutes: number | null;
  notes: string | null;
  category: CategoriaEvento;
  birth_year: number | null;
  place_id: string | null;
  reserved: boolean;
  reservation_note: string | null;
};
export type DatosEventoNuevo = DatosEvento & { is_secret: boolean };

export const MAX_TITULO = 120;
export const HORA_POR_DEFECTO = '21:00';

export type Formulario = {
  titulo: string;
  secreto: boolean;
  fecha: string;
  todoElDia: boolean;
  /** `HH:MM`; se ignora si es de todo el día. */
  hora: string;
  repeticion: Repeticion;
  asistentes: Asistentes;
  /** Texto tal como se escribe («60», «12,50»). Vacío = sin presupuesto. */
  presupuesto: string;
  preguntarQuienPago: boolean;
  aviso: number | null;
  notas: string;
  /** `birthday` = formulario de cumpleaños (día y mes en vez de fecha, sin hora ni repetición). */
  categoria: CategoriaEvento;
  /** Varios días (siempre todo el día): `fecha` es «Desde» y `fechaFin` «Hasta». */
  variosDias: boolean;
  fechaFin: string;
  /** Cumpleaños: día y mes (el año ancla es 2000, así que el 29 de febrero existe). */
  dia: number;
  mes: number;
  /** Cumpleaños: año de nacimiento tal como se escribe; vacío = no se sabe. */
  anioNacimiento: string;
  /** Sitio del Mapa (opcional). */
  sitioId: string | null;
  /** «Reservado» y su nota (solo cuenta si está reservado). */
  reservado: boolean;
  notaReserva: string;
};

export const MAX_NOTA_RESERVA = 200;

/** Reserva lista para guardar: sin reserva o sin texto, la nota es null. */
export const reservaAGuardar = (reservado: boolean, nota: string): { reserved: boolean; reservation_note: string | null } => ({
  reserved: reservado,
  reservation_note: reservado ? nota.trim().slice(0, MAX_NOTA_RESERVA) || null : null,
});

const CATEGORIAS_RESERVABLES: CategoriaEvento[] = ['eating_out', 'trip', 'leisure'];

/** «Marcar como reservado» en el detalle: comer fuera, viaje u ocio que aún no ha acabado y sin reserva. */
export const puedeMarcarReservado = (e: Pick<Evento, 'reserved' | 'category'>, fin: string, hoy: string): boolean =>
  !e.reserved && CATEGORIAS_RESERVABLES.includes(e.category) && fin >= hoy;

export const REPETICIONES: { valor: Repeticion; etiqueta: string }[] = [
  { valor: 'none', etiqueta: 'Nunca' },
  { valor: 'weekly', etiqueta: 'Cada semana' },
  { valor: 'monthly', etiqueta: 'Cada mes' },
  { valor: 'yearly', etiqueta: 'Cada año' },
];

// -----------------------------------------------------------------------------
// Avisos. El servidor solo exige `reminder_minutes >= 0` (minutos antes de `starts_at`); el significado
// de cada valor lo fija la app. Los de todo el día cuentan desde las 00:00 de ese día: «el día antes a las
// 9:00» son 24 h - 9 h = 900 minutos y «una semana antes a las 9:00», 7 días - 9 h = 9540.
// -----------------------------------------------------------------------------

export type OpcionAviso = { valor: number | null; etiqueta: string };

const AVISOS_CON_HORA: OpcionAviso[] = [
  { valor: null, etiqueta: 'Sin aviso' },
  { valor: 0, etiqueta: 'A la hora' },
  { valor: 60, etiqueta: '1 hora antes' },
  { valor: 1440, etiqueta: '1 día antes' },
];
const AVISOS_TODO_EL_DIA: OpcionAviso[] = [
  { valor: null, etiqueta: 'Sin aviso' },
  { valor: 900, etiqueta: 'El día antes (9:00)' },
  { valor: 9540, etiqueta: 'Una semana antes (9:00)' },
];
const DIA_ANTES = { conHora: 1440, todoElDia: 900 };
/** Aviso por defecto de un cumpleaños: el día antes a las 9:00. */
export const AVISO_CUMPLE = DIA_ANTES.todoElDia;

/** Texto de un aviso que no está en las opciones (un valor guardado por otra vía): «30 min antes». */
function textoMinutos(minutos: number): string {
  if (minutos % 1440 === 0) return `${minutos / 1440} ${minutos === 1440 ? 'día' : 'días'} antes`;
  if (minutos % 60 === 0) return `${minutos / 60} horas antes`;
  return `${minutos} min antes`;
}

/** Opciones de aviso según sea con hora o de todo el día; `actual` se añade si no está entre ellas (no se pierde). */
export function avisosDisponibles(todoElDia: boolean, actual: number | null = null): OpcionAviso[] {
  const base = todoElDia ? AVISOS_TODO_EL_DIA : AVISOS_CON_HORA;
  return actual === null || base.some((o) => o.valor === actual) ? base : [...base, { valor: actual, etiqueta: textoMinutos(actual) }];
}

/** Al pasar de con hora a todo el día (o al revés): «1 día antes» ↔ «El día antes»; el resto no tiene equivalente. */
export function ajustarAviso(minutos: number | null, aTodoElDia: boolean): number | null {
  if (minutos === null) return null;
  if (aTodoElDia) return minutos === DIA_ANTES.conHora ? DIA_ANTES.todoElDia : AVISOS_TODO_EL_DIA.some((o) => o.valor === minutos) ? minutos : null;
  return minutos === DIA_ANTES.todoElDia ? DIA_ANTES.conHora : AVISOS_CON_HORA.some((o) => o.valor === minutos) ? minutos : null;
}

const dos = (n: number) => String(n).padStart(2, '0');
const minutosDeHora = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));

/** «Te avisaremos a las 20:30», «Te avisaremos el día antes, a las 9:00». */
export function textoAviso(minutos: number, todoElDia: boolean, hora: string | null): string {
  const inicio = todoElDia || !hora ? 0 : minutosDeHora(hora);
  const instante = inicio - minutos;
  const dia = Math.floor(instante / 1440);
  const resto = instante - dia * 1440;
  const cuando = `${Math.floor(resto / 60)}:${dos(resto % 60)}`;
  if (dia === 0) return `Te avisaremos a las ${cuando}`;
  if (dia === -1) return `Te avisaremos el día antes, a las ${cuando}`;
  if (dia === -7) return `Te avisaremos una semana antes, a las ${cuando}`;
  return `Te avisaremos ${-dia} días antes, a las ${cuando}`;
}

// -----------------------------------------------------------------------------
// Formulario ↔ fila
// -----------------------------------------------------------------------------

/**
 * Formulario vacío para un evento nuevo en `fecha`. `categoria`: la que sugiere el filtro del calendario
 * (Viaje → «Varios días» activo; `birthday` → formulario de cumpleaños de parte de `yo`, con el aviso del día antes).
 */
export function formularioNuevo(fecha: string, categoria: CategoriaEvento = 'other', yo: Hueco = 'm1', sitioId: string | null = null): Formulario {
  const base: Formulario = {
    titulo: '',
    secreto: false,
    fecha,
    todoElDia: false,
    hora: HORA_POR_DEFECTO,
    repeticion: 'none',
    asistentes: 'both',
    presupuesto: '',
    preguntarQuienPago: false,
    aviso: null,
    notas: '',
    categoria: 'other',
    variosDias: false,
    fechaFin: sumarDias(fecha, 1),
    dia: Number(fecha.slice(8, 10)),
    mes: Number(fecha.slice(5, 7)),
    anioNacimiento: '',
    sitioId,
    reservado: false,
    notaReserva: '',
  };
  if (categoria === 'birthday') return conTipo(base, 'cumple', yo);
  return categoria === 'trip' ? conCategoria({ ...base, categoria }, 'trip', false) : { ...base, categoria };
}

const centsATexto = (cents: number) => (cents / 100).toFixed(2).replace('.', ',').replace(/,00$/, '');

/** Fila → formulario (al editar). */
export function deEvento(e: Evento): Formulario {
  return {
    titulo: e.title,
    secreto: e.is_secret,
    fecha: e.start_date,
    todoElDia: e.all_day,
    hora: e.start_time ?? HORA_POR_DEFECTO,
    repeticion: e.recurrence,
    asistentes: e.attendees,
    presupuesto: e.budget_cents === null ? '' : centsATexto(e.budget_cents),
    preguntarQuienPago: e.ask_who_paid,
    aviso: e.reminder_minutes,
    notas: e.notes ?? '',
    categoria: e.category,
    variosDias: e.end_date !== null,
    fechaFin: e.end_date ?? sumarDias(e.start_date, 1),
    dia: Number(e.start_date.slice(8, 10)),
    mes: Number(e.start_date.slice(5, 7)),
    anioNacimiento: e.birth_year === null ? '' : String(e.birth_year),
    sitioId: e.place_id,
    reservado: e.reserved,
    notaReserva: e.reservation_note ?? '',
  };
}

const dosCifras = (n: number) => String(n).padStart(2, '0');

/** Cuántos días dura el evento del formulario (1 si no es de varios días). */
export const duracionDias = (f: Pick<Formulario, 'variosDias' | 'fecha' | 'fechaFin'>): number =>
  f.variosDias ? diasEntre(f.fecha, f.fechaFin) + 1 : 1;

/**
 * Repeticiones que caben en un evento que dura `duracion` días sin pisarse con la siguiente (las mismas que
 * exige el CHECK `events_varios_dias`): cada semana hasta 7 días, cada mes hasta 28, cada año siempre.
 */
export function repeticionesPermitidas(duracion: number): Repeticion[] {
  const lista: Repeticion[] = ['none'];
  if (duracion <= 7) lista.push('weekly');
  if (duracion <= 28) lista.push('monthly');
  lista.push('yearly');
  return lista;
}

/** «Dura demasiado para repetirse cada semana», o null si la repetición cabe. */
export function motivoRepeticion(repeticion: Repeticion, duracion: number): string | null {
  if (repeticionesPermitidas(duracion).includes(repeticion)) return null;
  return `Dura demasiado para repetirse ${textoCorto(repeticion)}`;
}

/**
 * Formulario tras activar o quitar «Varios días»: pasa a todo el día. La repetición NO se toca: si ya no cabe,
 * `validar` lo dice y bloquea el guardado (cambiarla sola convertiría una serie en un evento suelto sin avisar).
 */
export function conVariosDias(f: Formulario, variosDias: boolean): Formulario {
  if (!variosDias) return { ...f, variosDias: false };
  return {
    ...f,
    variosDias: true,
    todoElDia: true,
    aviso: ajustarAviso(f.aviso, true),
    fechaFin: f.fechaFin > f.fecha ? f.fechaFin : sumarDias(f.fecha, 1),
  };
}

/**
 * Formulario tras elegir la categoría. Viaje activa «Varios días» si la persona no lo ha tocado
 * (`variosTocado`); elegir otra categoría no lo quita.
 */
export function conCategoria(f: Formulario, categoria: CategoriaEvento, variosTocado: boolean): Formulario {
  const g = { ...f, categoria };
  return categoria === 'trip' && !variosTocado && !g.variosDias ? conVariosDias(g, true) : g;
}

/** Formulario tras cambiar «Desde»: en un evento de varios días, «Hasta» se mueve los mismos días. */
export function conFecha(f: Formulario, fecha: string): Formulario {
  return f.variosDias ? { ...f, fecha, fechaFin: sumarDias(fecha, diasEntre(f.fecha, f.fechaFin)) } : { ...f, fecha };
}

/** Formulario tras cambiar «Hasta». La repetición no se toca (si ya no cabe, `validar` lo avisa). */
export const conFechaFin = (f: Formulario, fechaFin: string): Formulario => ({ ...f, fechaFin });

/**
 * Formulario tras cambiar entre Evento y Cumpleaños (el título y las notas se conservan). Un cumpleaños:
 * de parte de `yo`, aviso el día antes, día y mes de la fecha elegida, sin secreto, hora ni repetición propia.
 */
export function conTipo(f: Formulario, tipo: 'evento' | 'cumple', yo: Hueco): Formulario {
  if (tipo === 'cumple') {
    return {
      ...f,
      categoria: 'birthday',
      secreto: false,
      asistentes: yo,
      variosDias: false,
      todoElDia: true,
      repeticion: 'yearly',
      presupuesto: '',
      preguntarQuienPago: false,
      aviso: AVISO_CUMPLE,
      dia: Number(f.fecha.slice(8, 10)),
      mes: Number(f.fecha.slice(5, 7)),
    };
  }
  return {
    ...f,
    categoria: 'other',
    asistentes: 'both',
    todoElDia: false,
    repeticion: 'none',
    aviso: null,
    anioNacimiento: '',
  };
}

/** Días que tiene `mes` en el año ancla (bisiesto): febrero, 29. */
export const diasDelMesCumple = (mes: number): number => new Date(ANIO_ANCLA_CUMPLE, mes, 0).getDate();

/** Formulario de cumpleaños tras elegir día y mes: si el día no existe en ese mes, el último (31 → 30 en abril). */
export function conDiaMes(f: Formulario, dia: number, mes: number): Formulario {
  return { ...f, mes, dia: Math.min(dia, diasDelMesCumple(mes)) };
}

/** `2000-03-15`: la fecha que se guarda de un cumpleaños. */
export const fechaCumple = (mes: number, dia: number): string => `${ANIO_ANCLA_CUMPLE}-${dosCifras(mes)}-${dosCifras(dia)}`;

/** Año de nacimiento escrito si son 4 cifras; null si está vacío o a medias. */
export function leerAnioNacimiento(texto: string): number | null {
  const t = texto.trim();
  return /^\d{4}$/.test(t) ? Number(t) : null;
}

/**
 * Formulario → columnas de `events`.
 * - Cumpleaños: `2000-MM-DD`, cada año, todo el día, sin presupuesto ni «¿Quién pagó?» (CHECK `events_cumple`).
 * - Varios días: todo el día, sin hora y con `end_date`; un solo día manda `end_date: null` (nunca igual a la fecha).
 * - Todo el día limpia la hora; sin presupuesto, con repetición o si tú no vas (`yo`: tu hueco; «solo va tu
 *   pareja») no hay «¿Quién pagó?»: el CHECK de la base de datos lo exige en los dos primeros casos, y en el
 *   último nadie podría responderla (a quien va no le llega si el evento es secreto, y tú no vas).
 * Un aviso que no encaja con el modo se quita.
 */
export function aDatos(f: Formulario, yo: Hueco): DatosEvento {
  const notas = f.notas.trim();
  if (f.categoria === 'birthday') {
    return {
      title: f.titulo.trim(),
      start_date: fechaCumple(f.mes, f.dia),
      start_time: null,
      end_date: null,
      all_day: true,
      recurrence: 'yearly',
      attendees: f.asistentes,
      budget_cents: null,
      ask_who_paid: false,
      reminder_minutes: f.aviso,
      notes: notas === '' ? null : notas,
      category: 'birthday',
      birth_year: leerAnioNacimiento(f.anioNacimiento),
      place_id: null,
      reserved: false,
      reservation_note: null,
    };
  }
  const presupuesto = leerEuros(f.presupuesto);
  const varios = f.variosDias && f.fechaFin > f.fecha;
  const todoElDia = f.todoElDia || varios;
  return {
    title: f.titulo.trim(),
    start_date: f.fecha,
    start_time: todoElDia ? null : f.hora,
    end_date: varios ? f.fechaFin : null,
    all_day: todoElDia,
    recurrence: f.repeticion,
    attendees: f.asistentes,
    budget_cents: presupuesto,
    ask_who_paid: presupuesto !== null && f.repeticion === 'none' && vaAlEvento(f.asistentes, yo) && f.preguntarQuienPago,
    reminder_minutes: f.aviso,
    notes: notas === '' ? null : notas,
    category: f.categoria,
    birth_year: null,
    place_id: f.sitioId,
    ...reservaAGuardar(f.reservado, f.notaReserva),
  };
}

/** Al crear se envía además si es secreto (un cumpleaños nunca lo es). */
export const aDatosNuevo = (f: Formulario, yo: Hueco): DatosEventoNuevo => ({
  ...aDatos(f, yo),
  is_secret: f.categoria === 'birthday' ? false : f.secreto,
});

/** Formulario tras marcar «Todo el día» o quitarlo: el aviso se adapta. */
export const conTodoElDia = (f: Formulario, todoElDia: boolean): Formulario => ({
  ...f,
  todoElDia,
  aviso: ajustarAviso(f.aviso, todoElDia),
});

/**
 * Formulario tras activar o quitar «Evento secreto». Al activarlo, «¿Quién va?» pasa a «Solo tú» (se puede
 * cambiar); al quitarlo vuelve a lo que había, salvo que ya se haya cambiado a mano.
 */
export function conSecreto(f: Formulario, secreto: boolean, yo: Hueco, antes: Asistentes): Formulario {
  if (secreto) return { ...f, secreto, asistentes: yo };
  return { ...f, secreto, asistentes: f.asistentes === yo ? antes : f.asistentes };
}

/**
 * ¿Preguntar «¿Quién pagó?» tras cambiar el presupuesto? Se activa solo al poner un importe (si no se ha
 * tocado el interruptor) y se quita al vaciarlo.
 */
export function preguntarTrasPresupuesto(anterior: string, nuevo: string, preguntar: boolean, tocado: boolean): boolean {
  const habia = leerEuros(anterior) !== null;
  const hay = leerEuros(nuevo) !== null;
  if (!hay) return false;
  if (!habia && !tocado) return true;
  return preguntar;
}

export type ErroresEvento = {
  titulo: string | null;
  presupuesto: string | null;
  /** Duración de un evento de varios días («Como mucho 31 días.»). */
  fecha: string | null;
  anioNacimiento: string | null;
  repeticion: string | null;
};

export const SIN_ERRORES: ErroresEvento = { titulo: null, presupuesto: null, fecha: null, anioNacimiento: null, repeticion: null };

/** Error del año de nacimiento de un cumpleaños: 4 cifras, entre 1900 y este año, y bisiesto si es 29 de febrero. */
function errorAnioNacimiento(f: Formulario, hoy: string): string | null {
  const t = f.anioNacimiento.trim();
  if (t === '') return null;
  const anio = leerAnioNacimiento(t);
  if (anio === null) return 'Escribe el año con 4 cifras, por ejemplo 1966.';
  const actual = Number(hoy.slice(0, 4));
  if (anio < 1900 || anio > actual) return `Escribe un año entre 1900 y ${actual}.`;
  if (f.dia === 29 && f.mes === 2 && !esBisiesto(anio)) return 'Ese año no tuvo 29 de febrero.';
  return null;
}

/**
 * Error de cada campo (null = bien); el formulario los enseña solo tras un intento de guardar. Se puede crear
 * un evento en una fecha pasada (un viaje que ya empezó, apuntar algo que ya pasó): no hay error por eso.
 */
export function validar(f: Formulario, hoy: string): ErroresEvento {
  const cumple = f.categoria === 'birthday';
  const duracion = duracionDias(f);
  return {
    titulo:
      f.titulo.trim() === ''
        ? cumple
          ? 'Escribe quién cumple, por ejemplo Carmen.'
          : 'Escribe un título, por ejemplo Cena con Marta.'
        : null,
    presupuesto:
      !cumple && f.presupuesto.trim() !== '' && leerEuros(f.presupuesto) === null ? 'Escribe un importe, por ejemplo 60 o 12,50.' : null,
    fecha:
      cumple || !f.variosDias
        ? null
        : f.fechaFin <= f.fecha
          ? 'El último día tiene que ser posterior al primero.'
          : duracion > MAX_DIAS_VARIOS
            ? `Como mucho ${MAX_DIAS_VARIOS} días.`
            : null,
    anioNacimiento: cumple ? errorAnioNacimiento(f, hoy) : null,
    repeticion: cumple ? null : motivoRepeticion(f.repeticion, duracion),
  };
}

export const hayErrores = (e: ErroresEvento) => Object.values(e).some((x) => x !== null);

// -----------------------------------------------------------------------------
// Textos
// -----------------------------------------------------------------------------

/** `HH:MM:SS` de Postgres → `HH:MM`. */
export const horaCorta = (hora: string | null): string | null => (hora ? hora.slice(0, 5) : null);

/** Fila de `events` tal como llega de la API → `Evento`. */
export const aEvento = (f: FilaEvento): Evento => ({ ...f, start_time: horaCorta(f.start_time) });

/** «Vais los dos», «Solo vas tú», «Solo va Meri». */
export function textoAsistentes(asistentes: Asistentes, yo: Hueco, nombrePareja: string): string {
  if (asistentes === 'both') return 'Vais los dos';
  return asistentes === yo ? 'Solo vas tú' : `Solo va ${nombrePareja}`;
}

/** «Hoy, jueves 12», «Mañana, viernes 13», «Domingo 15 mar» (con el año si no es el de hoy). */
function textoDia(fecha: string, hoy: string): string {
  const d = deISO(fecha);
  const dia = `${DIAS_SEMANA[d.getDay()].toLowerCase()} ${d.getDate()}`;
  return fecha === hoy ? `Hoy, ${dia}` : fecha === sumarDias(hoy, 1) ? `Mañana, ${dia}` : fechaLarga(fecha, deISO(hoy));
}

/** «Hoy, jueves 12 · 21:30», «Mañana, viernes 13 · todo el día», «Domingo 15 mar · todo el día». */
export function textoCuando(fecha: string, hora: string | null, todoElDia: boolean, hoy: string): string {
  return `${textoDia(fecha, hoy)} · ${todoElDia || !hora ? 'todo el día' : hora}`;
}

/** «3 días». */
export const textoDuracion = (dias: number) => `${dias} ${dias === 1 ? 'día' : 'días'}`;

/**
 * «Del vie 14 al dom 16 nov · 3 días»; si cambia el mes, «Del sáb 28 oct al mar 3 nov · 7 días».
 * `inicio` y `fin` son el primer y el último día (los dos incluidos).
 */
export function textoVariosDias(inicio: string, fin: string): string {
  const [, mesInicio] = diaMesCorto(inicio).split(' ');
  const [, mesFin] = diaMesCorto(fin).split(' ');
  const desde = mesInicio === mesFin ? diaCorto(inicio) : `${diaCorto(inicio)} ${mesInicio}`;
  return `Del ${desde} al ${diaCorto(fin)} ${mesFin} · ${textoDuracion(diasEntre(inicio, fin) + 1)}`;
}

/** «Hasta el domingo 16 · día 2 de 3» si `hoy` está entre `inicio` y `fin`; si no, null. */
export function textoEnCurso(inicio: string, fin: string, hoy: string): string | null {
  if (hoy < inicio || hoy > fin) return null;
  const d = deISO(fin);
  return `Hasta el ${DIAS_SEMANA[d.getDay()].toLowerCase()} ${d.getDate()} · día ${diasEntre(inicio, hoy) + 1} de ${diasEntre(inicio, fin) + 1}`;
}

/** «Cumple de Carmen». El título que se guarda es solo el nombre. */
export const tituloCumple = (nombre: string) => `Cumple de ${nombre}`;

/** «Cumple 60» (con el año de nacimiento) o null. `fecha`: la repetición que se mira. */
export function textoEdad(anioNacimiento: number | null | undefined, fecha: string): string | null {
  const años = edad(anioNacimiento, fecha);
  return años === null ? null : `Cumple ${años}`;
}

/** «Domingo 15 mar · cumple 60» (sin año de nacimiento, solo la fecha). */
export function textoCuandoCumple(fecha: string, anioNacimiento: number | null | undefined, hoy: string): string {
  const años = edad(anioNacimiento, fecha);
  return `${textoDia(fecha, hoy)}${años === null ? '' : ` · cumple ${años}`}`;
}

/** Ayuda en vivo del formulario de cumpleaños: «Cumplirá 60 el 15 mar 2027» o «Cumple 60 hoy»; null si no hay año válido. */
export function textoCumplira(f: Pick<Formulario, 'dia' | 'mes' | 'anioNacimiento'>, hoy: string): string | null {
  const anio = leerAnioNacimiento(f.anioNacimiento);
  if (anio === null || (f.dia === 29 && f.mes === 2 && !esBisiesto(anio))) return null;
  const fecha = proximaRepeticion(fechaCumple(f.mes, f.dia), 'yearly', null, hoy);
  const años = fecha ? edad(anio, fecha) : null;
  if (!fecha || años === null) return null;
  return fecha === hoy ? `Cumple ${años} hoy` : `Cumplirá ${años} el ${diaMesCorto(fecha)} ${fecha.slice(0, 4)}`;
}

/** «De tu parte», «De parte de Meri», «De parte de los dos» (el cumpleaños es de quien se marcó al crearlo). */
export function textoDeParte(asistentes: Asistentes, yo: Hueco, nombrePareja: string): string {
  if (asistentes === 'both') return 'De parte de los dos';
  return asistentes === yo ? 'De tu parte' : `De parte de ${nombrePareja}`;
}

/** «Se repite cada año»; null si no se repite. */
export function textoSerie(repeticion: Repeticion): string | null {
  const t = textoCorto(repeticion);
  return t ? `Se repite ${t}` : null;
}
