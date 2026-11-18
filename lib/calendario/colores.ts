/**
 * Colores y glifos del calendario (docs/plan-calendario-v2.md §2.2 y §2.3; docs/plan-calendario-iconos.md): el
 * glifo dice qué es y el color de quién es. El color se pinta como el avatar y el selector de perfil: relleno
 * pastel (`bg`) con contorno fino en el tono oscuro (`ink`); el `ink` es solo para contornos y el glifo.
 *
 * - Evento de un día: insignia circular con el icono de su categoría (viaje, comer fuera, ocio, otros). De los
 *   dos: la insignia va partida en vertical (m1 a la izquierda, m2 a la derecha, siempre en ese orden para que
 *   los dos móviles se vean igual).
 * - Cumpleaños: la misma insignia con un regalo fucsia.
 * - Pago: cuadrado naranja (el pago no es de una persona) con monedas amontonadas en blanco; si es recurrente, las
 *   mismas monedas con una insignia de bucle (círculo con flecha circular) en una esquina.
 * - Varios días: barra con relleno pastel y contorno oscuro (cinta bicolor si es de los dos).
 * Persona sin color elegido (o pareja aún sin unir): el azul de siempre. Si las dos mitades salen iguales, no se parte.
 */
import { colors, personColors, type ColorPersona } from '@/constants/theme';
import type { Frecuencia } from '@/lib/gastos/recurrentes';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

export type FormaMarcador = 'insignia' | 'pago';

/** Nombres de Ionicons (versión rellena) de los glifos del calendario. */
export type IconoMarcador = 'airplane' | 'restaurant' | 'ticket' | 'calendar' | 'gift';

/** Icono de cada categoría de evento; las demás («Otros») llevan el calendario. */
const ICONO_CATEGORIA: Record<string, IconoMarcador> = {
  trip: 'airplane',
  eating_out: 'restaurant',
  leisure: 'ticket',
  birthday: 'gift',
};

export type MarcadorSpec = {
  forma: FormaMarcador;
  /** Icono de la insignia (no lo lleva el pago, que dibuja monedas). */
  icono?: IconoMarcador;
  /** Solo en el pago: recurrente (monedas + insignia de bucle) o único (solo monedas). */
  recurrente?: boolean;
  /** Relleno (en una insignia partida, la mitad izquierda: m1). */
  relleno: string;
  /** Contorno (en una insignia partida, el de la mitad izquierda). */
  borde: string;
  /** Mitad derecha (m2): solo si es de los dos y sus colores difieren. */
  relleno2?: string;
  borde2?: string;
  /** Color del glifo (el icono) sobre el relleno. */
  tinta: string;
};

/** Lo que hace falta de un elemento del calendario para elegir su marcador. */
export type ParaMarcador = {
  tipo: 'event' | 'payment';
  categoria: string | null;
  asistentes: 'both' | 'm1' | 'm2';
  /** Solo pagos: cada cuánto se cobra. Sin ella (no se sabe) se pinta como recurrente, que es lo habitual. */
  frecuencia?: Frecuencia | null;
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
export const paletaDe = (color: ColorPersona | null | undefined): Paleta =>
  color ? { relleno: personColors[color].bg, borde: personColors[color].ink } : { relleno: colors.eventChip, borde: colors.eventDot };

/** Paletas de quien va (o de parte de quien es): una, o las dos si son distintas. */
function paletasDe(asistentes: ParaMarcador['asistentes'], m1: ColorPersona | null, m2: ColorPersona | null): [Paleta, Paleta | null] {
  const a = paletaDe(m1);
  const b = paletaDe(m2);
  if (asistentes === 'm1') return [a, null];
  if (asistentes === 'm2') return [b, null];
  return a.relleno === b.relleno && a.borde === b.borde ? [a, null] : [a, b];
}

/** Marcador de un elemento. `m1` y `m2`: color de perfil de cada hueco de la pareja. */
export function marcador(e: ParaMarcador, m1: ColorPersona | null, m2: ColorPersona | null): MarcadorSpec {
  if (e.tipo === 'payment') {
    return { forma: 'pago', recurrente: e.frecuencia !== 'once', relleno: colors.pagoMarca, borde: colors.pagoMarca, tinta: colors.white };
  }
  const [uno, dos] = paletasDe(e.asistentes, m1, m2);
  const cumple = e.categoria === 'birthday';
  return {
    forma: 'insignia',
    icono: (e.categoria && ICONO_CATEGORIA[e.categoria]) || 'calendar',
    relleno: uno.relleno,
    borde: uno.borde,
    ...(dos ? { relleno2: dos.relleno, borde2: dos.borde } : {}),
    // El regalo es siempre fucsia; el resto, el tono oscuro de la persona (o texto normal si la insignia va partida).
    tinta: cumple ? colors.cumpleMarca : dos ? colors.text : uno.borde,
  };
}

export type ColorBarra = { relleno: string; borde: string; relleno2: string | null; borde2: string | null };

/** Colores de una barra de varios días: uno, o dos (arriba/izquierda m1, abajo/derecha m2) si van los dos. */
export function colorBarra(e: ParaMarcador, m1: ColorPersona | null, m2: ColorPersona | null): ColorBarra {
  const [uno, dos] = paletasDe(e.asistentes, m1, m2);
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
