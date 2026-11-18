/**
 * Colores del calendario (docs/plan-calendario-v2.md §2.2 y §2.3): la forma dice qué es y el color de quién es.
 *
 * - Evento de una persona: círculo con el tono oscuro (`ink`) de su color de perfil. De los dos: círculo
 *   partido en vertical (m1 a la izquierda, m2 a la derecha, siempre en ese orden para que los dos móviles
 *   se vean igual).
 * - Pago: cuadrado naranja.
 * - Cumpleaños: círculo fucsia con un anillo del color de la persona de quien es (mitad y mitad si es de los dos).
 * Persona sin color elegido (o pareja aún sin unir): el azul de siempre. Si las dos mitades salen iguales, no se parte.
 */
import { colors, personColors, type ColorPersona } from '@/constants/theme';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

export type FormaMarcador = 'circulo' | 'mitades' | 'cuadrado' | 'anillo';

export type MarcadorSpec = {
  forma: FormaMarcador;
  /** Color del relleno (en `mitades`, la mitad izquierda: m1). */
  relleno: string;
  /** Mitad derecha (m2); solo en `mitades`. */
  relleno2?: string;
  /** Color del anillo del cumpleaños (la mitad izquierda si es de los dos). */
  anillo?: string;
  /** Mitad derecha del anillo; solo si el cumpleaños es de los dos y sus colores difieren. */
  anillo2?: string;
};

/** Lo que hace falta de un elemento del calendario para elegir su marcador. */
export type ParaMarcador = {
  tipo: 'event' | 'payment';
  categoria: string | null;
  asistentes: 'both' | 'm1' | 'm2';
};

/** Color de perfil de cada hueco de la pareja (m1 y m2), sea quien sea «yo». */
export type ColoresHuecos = { m1: ColorPersona | null; m2: ColorPersona | null };

export function coloresDeHuecos(pareja: Pick<Pareja, 'yo' | 'otra'>): ColoresHuecos {
  const huecos: ColoresHuecos = { m1: null, m2: null };
  huecos[pareja.yo.slot] = pareja.yo.color;
  if (pareja.otra) huecos[pareja.otra.slot] = pareja.otra.color;
  return huecos;
}

/** Tono oscuro (≥ 3:1 sobre blanco) del color de perfil; el azul de reserva si no hay. */
export const tintaDe = (color: ColorPersona | null | undefined): string => (color ? personColors[color].ink : colors.eventDot);

/** Colores de quien va (o de parte de quien es): uno, o los dos si son distintos. */
function coloresDe(asistentes: ParaMarcador['asistentes'], m1: ColorPersona | null, m2: ColorPersona | null): [string, string | null] {
  const a = tintaDe(m1);
  const b = tintaDe(m2);
  if (asistentes === 'm1') return [a, null];
  if (asistentes === 'm2') return [b, null];
  return a === b ? [a, null] : [a, b];
}

/** Marcador de un elemento. `m1` y `m2`: color de perfil de cada hueco de la pareja. */
export function marcador(e: ParaMarcador, m1: ColorPersona | null, m2: ColorPersona | null): MarcadorSpec {
  if (e.tipo === 'payment') return { forma: 'cuadrado', relleno: colors.pagoMarca };
  const [uno, dos] = coloresDe(e.asistentes, m1, m2);
  if (e.categoria === 'birthday') {
    return { forma: 'anillo', relleno: colors.cumpleMarca, anillo: uno, ...(dos ? { anillo2: dos } : {}) };
  }
  return dos ? { forma: 'mitades', relleno: uno, relleno2: dos } : { forma: 'circulo', relleno: uno };
}

/** Color de una barra de varios días: uno, o dos (arriba/izquierda m1, abajo/derecha m2) si van los dos. */
export function colorBarra(e: ParaMarcador, m1: ColorPersona | null, m2: ColorPersona | null): { color: string; color2: string | null } {
  const [uno, dos] = coloresDe(e.asistentes, m1, m2);
  return { color: uno, color2: dos };
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
