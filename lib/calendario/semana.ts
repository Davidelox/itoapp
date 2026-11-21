/**
 * Vista Semana detallada (docs/plan-calendario-v2.md §2.6): una fila por día con hasta 3 líneas, y los eventos
 * de varios días como barras verticales continuas en 3 carriles. Sin React ni red: todo se puede probar.
 */
import {
  type ContextoLinea,
  type Elemento,
  agruparPorDia,
  esVariosDias,
  ordenar,
  pendienteDeBorrar,
  resumenDia,
  textoImporte,
  textoParteDe,
  textoFechasPlan,
  textoQuienPago,
  textoTipoPago,
  totalDias,
} from '@/lib/calendario/agrupar';
import { type IconoCalendario, INFO_CATEGORIA_EVENTO, textoAsistentes } from '@/lib/calendario/evento';
import { type SegmentoBarra, segmentosSemana } from '@/lib/calendario/carriles';
import { DIAS_SEMANA, diaCorto, diaDeMes } from '@/lib/calendario/rejilla';
import { edad } from '@/lib/calendario/repeticion';
import { deISO } from '@/lib/gastos/fechas';

export const MAX_LINEAS_SEMANA = 3;
export const MAX_CARRILES_SEMANA = 3;

/** Una línea de una fila de la semana. */
export type LineaDia = {
  clave: string;
  /** `fecha` = el día de la fila. Para abrir el detalle se usa `inicio`. */
  elemento: Elemento;
  /** «hasta el vie 18», «desde el jue 10» (con barra) o «día 2 de 5» (sin barra); null si no es de varios días. */
  sufijo: string | null;
};

export type FilaDia = {
  iso: string;
  lineas: LineaDia[];
  /** Elementos que no caben en las líneas («+2 más»). */
  mas: number;
  /** Para lectores de pantalla: «Lunes 14 de diciembre, hoy: 3 eventos; 1 pago. Toca para ver el día». */
  etiqueta: string;
};

export type DatosSemana = {
  filas: FilaDia[];
  /** Las barras verticales (`colInicio`/`colFin` = índice de fila, de lunes a domingo). */
  segmentos: SegmentoBarra[];
};

/**
 * Las filas de la semana y sus barras. `elementos`: uno por repetición (sin repartir por días), ya filtrado.
 * Un evento de varios días con barra pone su título UNA vez, en el primer día que se ve de esa semana
 * («Roma · hasta el vie 18», o «desde el jue 10» si empezó la semana anterior); sin barra (no cabía en los
 * carriles) sale como línea en cada día («Roma · día 2 de 5»). Orden: los de varios días, los de todo el
 * día, la hora, el título.
 */
export function filasSemana(
  dias: string[],
  elementos: Elemento[],
  opciones: { hoy: string; maxLineas?: number; maxCarriles?: number },
): DatosSemana {
  const maxLineas = opciones.maxLineas ?? MAX_LINEAS_SEMANA;
  const { segmentos } = segmentosSemana(dias, elementos, opciones.maxCarriles ?? MAX_CARRILES_SEMANA);
  const conBarra = new Set(segmentos.map((s) => `${s.elemento.origenId}@${s.elemento.inicio}`));
  const porDia = agruparPorDia(elementos);

  const filas = dias.map((iso): FilaDia => {
    const delDia = porDia[iso] ?? [];
    const candidatas: LineaDia[] = [];
    for (const e of ordenar(delDia)) {
      if (!esVariosDias(e)) {
        candidatas.push({ clave: e.clave, elemento: e, sufijo: null });
        continue;
      }
      // `e` ya es el del día `iso` (agruparPorDia); su barra se identifica por el evento y el inicio de la repetición.
      if (conBarra.has(`${e.origenId}@${e.inicio}`)) {
        // Con barra: una sola línea, en el primer día que se ve de esta semana.
        if (iso !== (e.inicio > dias[0] ? e.inicio : dias[0])) continue;
        candidatas.push({ clave: e.clave, elemento: e, sufijo: e.inicio < dias[0] ? `desde el ${diaCorto(e.inicio)}` : `hasta el ${diaCorto(e.fin)}` });
      } else {
        candidatas.push({ clave: e.clave, elemento: e, sufijo: `día ${e.diaN ?? 1} de ${totalDias(e)}` });
      }
    }
    const d = deISO(iso);
    const resumen = resumenDia(delDia);
    return {
      iso,
      lineas: candidatas.slice(0, maxLineas),
      mas: Math.max(0, candidatas.length - maxLineas),
      etiqueta: `${DIAS_SEMANA[d.getDay()]} ${diaDeMes(iso)}${iso === opciones.hoy ? ', hoy' : ''}${resumen ? `: ${resumen}` : ''}. Toca para ver el día`,
    };
  });
  return { filas, segmentos };
}

/** Las barras que pasan por la columna `col` (0 = lunes), de arriba abajo. */
export const barrasDeColumna = (segmentos: SegmentoBarra[], col: number): SegmentoBarra[] =>
  segmentos.filter((s) => s.colInicio <= col && col <= s.colFin).sort((a, b) => a.carril - b.carril);

/** Qué lleva una línea de la semana y cómo se lee. El título es lo único que se recorta (nunca la hora ni el importe). */
export type PartesLinea = {
  hora: string | null;
  icono: IconoCalendario | null;
  titulo: string;
  /** Importe de un pago, a la derecha y en negrita. */
  derecha: string | null;
  /** Pendiente de borrar: tachado y atenuado. */
  tachado: boolean;
  secreto: boolean;
  /** La línea entera para lectores de pantalla. */
  etiqueta: string;
};

/** Solo la primera letra en minúscula: «Solo va Meri» → «solo va Meri» (el nombre conserva su mayúscula). */
const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** «12,99 €» → «12,99 euros» para leerlo. */
const importeHablado = (importe: string) => importe.replace(/ ?€/, ' euros').replace(/ /g, ' ');

export function lineaSemana(l: LineaDia, ctx: ContextoLinea): PartesLinea {
  const e = l.elemento;
  const tachado = pendienteDeBorrar(e, ctx);
  const pendiente = tachado ? 'pendiente de borrar' : null;

  if (e.tipo === 'payment') {
    const importe = textoImporte(e);
    const quien = textoQuienPago(e, ctx);
    return {
      hora: null,
      icono: null,
      titulo: e.titulo,
      derecha: importe,
      tachado,
      secreto: false,
      etiqueta: [textoTipoPago(e), e.titulo, importe ? importeHablado(importe) : null, quien, e.estado === 'pending' ? 'falta el importe' : null, pendiente]
        .filter(Boolean)
        .join(', '),
    };
  }

  if (e.categoria === 'birthday') {
    const años = edad(e.anioNacimiento, e.inicio);
    const titulo = años === null ? e.titulo : `${e.titulo} · ${años}`;
    return {
      hora: null,
      icono: null,
      titulo,
      derecha: null,
      tachado,
      secreto: false,
      etiqueta: [e.titulo, años === null ? null : `cumple ${años}`, textoParteDe(e, ctx), pendiente].filter(Boolean).join(', '),
    };
  }

  if (e.tipo === 'plan') {
    const titulo = l.sufijo ? `${e.titulo} · ${l.sufijo}` : e.titulo;
    return {
      hora: null,
      icono: null,
      titulo,
      derecha: null,
      tachado,
      secreto: false,
      etiqueta: [`Plan: ${e.titulo}`, textoFechasPlan(e.inicio, e.fin), pendiente].filter(Boolean).join(', '),
    };
  }

  const categoria = e.categoria ?? 'other';
  const info = INFO_CATEGORIA_EVENTO[categoria];
  const titulo = l.sufijo ? `${e.titulo} · ${l.sufijo}` : e.titulo;
  const hora = esVariosDias(e) ? null : e.hora;
  const quien = ctx.conPareja === false && e.asistentes === 'both' ? null : minuscula(textoAsistentes(e.asistentes, ctx.yo, ctx.nombrePareja));
  return {
    hora,
    icono: info.icono,
    titulo,
    derecha: null,
    tachado,
    secreto: e.secreto,
    etiqueta: [
      hora,
      titulo,
      categoria === 'other' ? null : info.etiqueta.toLowerCase(),
      quien,
      e.secreto ? 'secreto' : null,
      pendiente,
    ]
      .filter(Boolean)
      .join(', '),
  };
}
