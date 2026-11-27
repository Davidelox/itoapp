/**
 * Colores y glifos del calendario (docs/plan-calendario-v2.md §2.2 y §2.3; docs/plan-calendario-iconos.md): el
 * glifo dice qué es y el color de quién es. El color se pinta como el avatar y el selector de perfil: relleno
 * pastel (`bg`) con contorno fino en el tono oscuro (`ink`); el `ink` es solo para contornos y el glifo.
 *
 * - Evento de un día: insignia circular con el icono de su categoría (viaje, comer fuera, ocio, otros). De los
 *   dos: la insignia va RAYADA (franjas en diagonal que alternan m1, m2, m1, m2; siempre empezando por m1 para que
 *   los dos móviles se vean igual).
 * - Cumpleaños: la misma insignia con un regalo fucsia.
 * - Pago: cuadrado con monedas amontonadas; si es recurrente, las mismas monedas con una insignia de bucle (círculo
 *   con flecha circular) en una esquina. Compartido, del bote o pagado por uno pero de los dos (no es de una
 *   persona): naranja con monedas blancas. EN SOLITARIO (lo paga y es solo suyo): pastel de esa persona con
 *   contorno y monedas en su tono oscuro, como un evento suyo.
 * - Varios días: barra con relleno pastel y contorno oscuro (franjas pequeñas alternas de m1 y m2 si es de los dos).
 * Persona sin color elegido (o pareja aún sin unir): el azul de siempre. Si los dos colores salen iguales, no se raya.
 */
import type { ColorPersona, Paleta as PaletaApp } from '@/constants/theme';
import type { Frecuencia } from '@/lib/gastos/recurrentes';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

export type FormaMarcador = 'insignia' | 'pago';

/** Nombres de Ionicons (versión rellena) de los glifos del calendario. */
export type IconoMarcador = 'airplane' | 'restaurant' | 'ticket' | 'football' | 'home' | 'film' | 'people' | 'heart' | 'calendar' | 'gift' | 'briefcase';

/** Icono de una opción del menú de filtros: los de la insignia o las monedas del pago. */
export type IconoFiltro = IconoMarcador | 'pago';

/** Icono de cada categoría de evento; las demás («Otros») llevan el calendario. */
const ICONO_CATEGORIA: Record<string, IconoMarcador> = {
  trip: 'airplane',
  eating_out: 'restaurant',
  leisure: 'ticket',
  sports: 'football',
  home_night: 'home',
  culture: 'film',
  social: 'people',
  health: 'heart',
  birthday: 'gift',
};

export type MarcadorSpec = {
  forma: FormaMarcador;
  /** Icono de la insignia (no lo lleva el pago, que dibuja monedas). */
  icono?: IconoMarcador;
  /** Un plan: su emoji en lugar del icono. */
  emoji?: string;
  /** Solo en el pago: recurrente (monedas + insignia de bucle) o único (solo monedas). */
  recurrente?: boolean;
  /** Relleno (en una insignia rayada, el de las franjas de m1). */
  relleno: string;
  /** Contorno (en una insignia rayada, el de las franjas de m1; en el pago, el del cuadrado). */
  borde: string;
  /** Franjas de m2: solo si es de los dos y sus colores difieren. */
  relleno2?: string;
  borde2?: string;
  /** Color del glifo (el icono o las monedas) sobre el relleno. */
  tinta: string;
};

/** Lo que hace falta de un elemento del calendario para elegir su marcador. */
export type ParaMarcador = {
  tipo: 'event' | 'payment' | 'plan';
  categoria: string | null;
  /** Solo planes: su emoji. */
  emoji?: string | null;
  asistentes: 'both' | 'm1' | 'm2';
  /** Solo pagos: cada cuánto se cobra. Sin ella (no se sabe) se pinta como recurrente, que es lo habitual. */
  frecuencia?: Frecuencia | null;
  /** Solo pagos: de quién es si es en solitario (`m1` o `m2`); null o sin él, compartido (naranja). */
  duenoSolo?: 'm1' | 'm2' | null;
};

/** Color de perfil de cada hueco de la pareja (m1 y m2), sea quien sea «yo». */
export type ColoresHuecos = { m1: ColorPersona | null; m2: ColorPersona | null };

export function coloresDeHuecos(pareja: Pick<Pareja, 'yo' | 'otra'>): ColoresHuecos {
  const huecos: ColoresHuecos = { m1: null, m2: null };
  huecos[pareja.yo.slot] = pareja.yo.color;
  if (pareja.otra) huecos[pareja.otra.slot] = pareja.otra.color;
  return huecos;
}

/** Relleno y contorno de una persona. */
export type Paleta = { relleno: string; borde: string };

/** Pastel (`bg`, lo que se eligió en el perfil) con contorno oscuro (`ink`); el azul de reserva si no hay color. */
export const paletaDe = (color: ColorPersona | null | undefined, colors: PaletaApp): Paleta =>
  color ? { relleno: colors.personas[color].bg, borde: colors.personas[color].ink } : { relleno: colors.eventChip, borde: colors.eventDot };

/** Paletas de quien va (o de parte de quien es): una, o las dos si son distintas. */
function paletasDe(asistentes: ParaMarcador['asistentes'], m1: ColorPersona | null, m2: ColorPersona | null, colors: PaletaApp): [Paleta, Paleta | null] {
  const a = paletaDe(m1, colors);
  const b = paletaDe(m2, colors);
  if (asistentes === 'm1') return [a, null];
  if (asistentes === 'm2') return [b, null];
  return a.relleno === b.relleno && a.borde === b.borde ? [a, null] : [a, b];
}

/** Marcador de un elemento. `m1` y `m2`: color de perfil de cada hueco de la pareja. */
export function marcador(e: ParaMarcador, m1: ColorPersona | null, m2: ColorPersona | null, colors: PaletaApp): MarcadorSpec {
  if (e.tipo === 'payment') {
    const recurrente = e.frecuencia !== 'once';
    if (e.duenoSolo) {
      // En solitario: la paleta de la persona (pastel + contorno oscuro); las monedas, en el tono oscuro.
      const { relleno, borde } = paletaDe(e.duenoSolo === 'm1' ? m1 : m2, colors);
      return { forma: 'pago', recurrente, relleno, borde, tinta: borde };
    }
    return { forma: 'pago', recurrente, relleno: colors.pagoMarca, borde: colors.pagoMarca, tinta: colors.onMarca };
  }
  if (e.tipo === 'plan') {
    // Un plan es de los dos y no lleva color de persona: granate suave con contorno granate (decisión 10 del plan v2).
    return { forma: 'insignia', icono: 'briefcase', ...(e.emoji ? { emoji: e.emoji } : {}), relleno: colors.accentSoft, borde: colors.accent, tinta: colors.accent };
  }
  const [uno, dos] = paletasDe(e.asistentes, m1, m2, colors);
  const cumple = e.categoria === 'birthday';
  return {
    forma: 'insignia',
    icono: (e.categoria && ICONO_CATEGORIA[e.categoria]) || 'calendar',
    relleno: uno.relleno,
    borde: uno.borde,
    ...(dos ? { relleno2: dos.relleno, borde2: dos.borde } : {}),
    // El regalo es siempre fucsia; el resto, el tono oscuro de la persona (o texto normal si la insignia va rayada).
    tinta: cumple ? colors.cumpleMarca : dos ? colors.text : uno.borde,
  };
}

/**
 * Marcador de una opción del menú de filtros: neutro (superficie con contorno y glifo de `icon`) y, si es la elegida,
 * en granate suave. «Pagos» dibuja las monedas del cuadrado de pago; el resto, una insignia con su icono.
 */
export function marcadorFiltro(opcion: { icono: IconoFiltro }, activo: boolean, colors: PaletaApp): MarcadorSpec {
  const relleno = activo ? colors.accentSoft : colors.surface;
  const tinta = activo ? colors.accent : colors.icon;
  if (opcion.icono === 'pago') return { forma: 'pago', recurrente: false, relleno, borde: tinta, tinta };
  return { forma: 'insignia', icono: opcion.icono, relleno, borde: tinta, tinta };
}

export type ColorBarra = { relleno: string; borde: string; relleno2: string | null; borde2: string | null };

/** Colores de una barra de varios días: uno, o dos (franjas alternas, empezando por m1) si van los dos. */
export function colorBarra(e: ParaMarcador, m1: ColorPersona | null, m2: ColorPersona | null, colors: PaletaApp): ColorBarra {
  if (e.tipo === 'plan') return { relleno: colors.accentSoft, borde: colors.accent, relleno2: null, borde2: null };
  const [uno, dos] = paletasDe(e.asistentes, m1, m2, colors);
  return { relleno: uno.relleno, borde: uno.borde, relleno2: dos?.relleno ?? null, borde2: dos?.borde ?? null };
}

// -----------------------------------------------------------------------------
// Contraste (WCAG 2.x): lo usan las pruebas para vigilar los tokens.
// -----------------------------------------------------------------------------

const canal = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Luminancia relativa de `#RRGGBB`. */
function luminancia(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

/** Relación de contraste entre dos colores `#RRGGBB` (de 1 a 21). */
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
