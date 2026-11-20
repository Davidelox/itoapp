/** Lógica pura de las colecciones del Mapa (docs/modelo-datos.md §8). Sin red ni React. */
import { agruparLista } from '@/lib/mapa/lista';
import type { Coleccion, Pertenencia, Sitio } from '@/lib/mapa/tipos';

export const MAX_NOMBRE_COLECCION = 60;
/** `collections.icon`: de 1 a 16 caracteres (el esquema cuenta puntos de código). */
export const MAX_ICONO = 16;

/** Los 12 iconos sugeridos de «Nueva colección»; «Otro…» abre el teclado de emojis. */
export const EMOJIS_SUGERIDOS: readonly { emoji: string; nombre: string }[] = [
  { emoji: '🍣', nombre: 'Sushi' },
  { emoji: '🍕', nombre: 'Pizza' },
  { emoji: '🍔', nombre: 'Hamburguesa' },
  { emoji: '☕', nombre: 'Café' },
  { emoji: '🍷', nombre: 'Vino' },
  { emoji: '🍰', nombre: 'Tarta' },
  { emoji: '🏖️', nombre: 'Playa' },
  { emoji: '🏔️', nombre: 'Montaña' },
  { emoji: '🎭', nombre: 'Teatro' },
  { emoji: '🛍️', nombre: 'Compras' },
  { emoji: '🌳', nombre: 'Parque' },
  { emoji: '⭐', nombre: 'Favoritos' },
];

const puntos = (t: string): number[] => Array.from(t).map((c) => c.codePointAt(0) as number);
const esModificador = (cp: number) =>
  cp === 0xfe0f || cp === 0x20e3 || (cp >= 0x1f3fb && cp <= 0x1f3ff) || (cp >= 0xe0020 && cp <= 0xe007f);
const esIndicadorRegional = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;

/**
 * Primer «carácter» de lo que escribe el teclado de emojis: un punto de código con sus modificadores (variación, tono de
 * piel, llave), las uniones ZWJ (👨‍👩‍👧) y las banderas (dos indicadores regionales). Sin `Intl.Segmenter`, que Hermes no garantiza.
 */
export function primerEmoji(texto: string): string {
  const cps = puntos(texto.trim());
  if (cps.length === 0) return '';
  let fin = 1;
  if (esIndicadorRegional(cps[0]) && cps[1] !== undefined && esIndicadorRegional(cps[1])) fin = 2;
  while (fin < cps.length) {
    if (esModificador(cps[fin])) fin += 1;
    else if (cps[fin] === 0x200d && cps[fin + 1] !== undefined) fin += 2;
    else break;
  }
  return String.fromCodePoint(...cps.slice(0, fin));
}

/** ¿Parece un emoji o un símbolo (y no una letra o un número)? Basta con salir del rango de texto latino y de la puntuación. */
export const pareceEmoji = (icono: string): boolean => {
  const cps = puntos(icono);
  if (cps.length === 0 || cps.length > MAX_ICONO) return false;
  const c = cps[0];
  return c >= 0x2190 || c === 0xa9 || c === 0xae || (c >= 0x30 && c <= 0x39 && cps.includes(0x20e3));
};

export type ErroresColeccion = { nombre: string | null; icono: string | null };

/** Nombre de 1 a 60 caracteres (sin contar espacios de los lados) e icono emoji de 1 a 16. */
export function validarColeccion(f: { nombre: string; icono: string }): ErroresColeccion {
  const nombre = f.nombre.trim();
  return {
    nombre:
      nombre.length === 0
        ? 'Ponle un nombre a la colección.'
        : nombre.length > MAX_NOMBRE_COLECCION
          ? `El nombre admite hasta ${MAX_NOMBRE_COLECCION} letras.`
          : null,
    icono: pareceEmoji(f.icono) ? null : 'Elige un icono: uno de los sugeridos o un emoji del teclado.',
  };
}

export const hayErroresColeccion = (e: ErroresColeccion) => e.nombre !== null || e.icono !== null;

/** Colección de un plan: su nombre e icono los manda el plan y se borra con él. */
export const esDePlan = (c: Pick<Coleccion, 'plan_id'>) => c.plan_id !== null;

/**
 * Quién puede cambiar la visibilidad de una colección ya creada: solo quien la creó, solo de privada a compartida
 * (una compartida no vuelve a ser privada, TW054) y nunca la de un plan (siempre compartida).
 */
export const puedeCambiarVisibilidad = (
  c: Pick<Coleccion, 'created_by' | 'plan_id' | 'visible_to_partner'>,
  userId: string | undefined,
) => !esDePlan(c) && !c.visible_to_partner && !!userId && c.created_by === userId;

/** Colecciones de un sitio, en el orden en que entró en ellas. */
export function coleccionesDeSitio(sitioId: string, colecciones: Coleccion[], pertenencias: Pertenencia[]): Coleccion[] {
  const porId = new Map(colecciones.map((c) => [c.id, c]));
  return pertenencias
    .filter((p) => p.place_id === sitioId)
    .sort((a, b) => a.added_at.localeCompare(b.added_at) || a.collection_id.localeCompare(b.collection_id))
    .flatMap((p) => porId.get(p.collection_id) ?? []);
}

/** Cuántos sitios hay en cada colección. */
export function contarSitios(pertenencias: Pertenencia[]): Map<string, number> {
  const n = new Map<string, number>();
  for (const p of pertenencias) n.set(p.collection_id, (n.get(p.collection_id) ?? 0) + 1);
  return n;
}

/**
 * Emoji del pin de cada sitio que lo tenga: el de la colección filtrada si hay una sola activa y el sitio está en ella;
 * si no, el de su colección principal. Sin colección (o con una que esta persona no ve), no sale y el pin usa el icono de la categoría.
 */
export function iconosDePin(
  sitios: Pick<Sitio, 'id' | 'primary_collection_id'>[],
  colecciones: Coleccion[],
  pertenencias: Pertenencia[],
  filtro: string[] = [],
): Map<string, string> {
  const porId = new Map(colecciones.map((c) => [c.id, c]));
  const unica = filtro.length === 1 ? filtro[0] : null;
  const enLaUnica = new Set(unica ? pertenencias.filter((p) => p.collection_id === unica).map((p) => p.place_id) : []);
  const iconos = new Map<string, string>();
  for (const s of sitios) {
    const id = unica && enLaUnica.has(s.id) ? unica : s.primary_collection_id;
    const c = id ? porId.get(id) : undefined;
    if (c) iconos.set(s.id, c.icon);
  }
  return iconos;
}

/** Colecciones de un sitio y cuál es la principal. `ids` va en el orden en que se eligieron. */
export type Seleccion = { ids: string[]; principal: string | null };

export const SIN_SELECCION: Seleccion = { ids: [], principal: null };

export type Eleccion = { seleccion: Seleccion; /** Ids de las otras colecciones en las que ya estaba: se pregunta si se quita de ellas. */ preguntar: string[] };

/** Marcar o desmarcar una colección. Al añadir una segunda (o más) se pregunta por las anteriores; si se quita la principal, pasa a la primera que quede. */
export function elegirColeccion(sel: Seleccion, id: string): Eleccion {
  if (sel.ids.includes(id)) {
    const ids = sel.ids.filter((x) => x !== id);
    return { seleccion: { ids, principal: sel.principal === id ? (ids[0] ?? null) : sel.principal }, preguntar: [] };
  }
  return { seleccion: { ids: [...sel.ids, id], principal: sel.principal ?? id }, preguntar: sel.ids };
}

/** «Quitar» de la pregunta: se queda solo la que se acaba de añadir, que pasa a ser la principal. */
export const quitarDeLasDemas = (id: string): Seleccion => ({ ids: [id], principal: id });

/** «Hacer principal»: solo si el sitio está en esa colección. */
export const hacerPrincipal = (sel: Seleccion, id: string): Seleccion => (sel.ids.includes(id) ? { ...sel, principal: id } : sel);

/** «¿Quitarlo de 🍣 Sushi, 🍕 Pizza?» */
export const textoPreguntaQuitar = (otras: Pick<Coleccion, 'icon' | 'name'>[]): string =>
  `¿Quitarlo de ${otras.map((c) => `${c.icon} ${c.name}`).join(', ')}?`;

/** «Mantener en las dos» (una sola otra) o «Mantener en todas». */
export const etiquetaMantener = (otras: number): string => (otras === 1 ? 'Mantener en las dos' : 'Mantener en todas');

export type PasosGuardado = {
  /** Se insertan primero (si el sitio no tenía ninguna, la principal entra la primera y el trigger la fija). */
  primero: string[];
  despues: string[];
  /** DELETE directo de esas filas de `collection_places`. */
  quitar: string[];
  /** `places.primary_collection_id` a fijar al final, si no basta con el trigger. */
  fijarPrincipal: string | null;
};

/** Qué hay que escribir para pasar del estado guardado al elegido. */
export function pasosGuardado(antes: Seleccion, despues: Seleccion): PasosGuardado {
  const anadir = despues.ids.filter((id) => !antes.ids.includes(id));
  const quitar = antes.ids.filter((id) => !despues.ids.includes(id));
  const primero = antes.ids.length === 0 && despues.principal && anadir.includes(despues.principal) ? [despues.principal] : [];
  const resto = anadir.filter((id) => !primero.includes(id));
  const fijar = despues.principal !== null && (antes.ids.length > 0 || primero.length === 0) && despues.principal !== antes.principal;
  return { primero, despues: resto, quitar, fijarPrincipal: fijar ? despues.principal : null };
}

export const hayCambiosColecciones = (p: PasosGuardado) => p.primero.length + p.despues.length + p.quitar.length > 0 || p.fijarPrincipal !== null;

/** «0 sitios», «1 sitio», «12 sitios». */
export const textoContadorSitios = (n: number): string => (n === 1 ? '1 sitio' : `${n} sitios`);

/** Sitios (de los que ve esta persona) que están en la colección, en el orden de la Lista: «Quiero ir» y luego «Hemos ido», el más reciente primero. */
export function sitiosDeColeccion(coleccionId: string, sitios: Sitio[], pertenencias: Pertenencia[]): Sitio[] {
  const dentro = new Set(pertenencias.filter((p) => p.collection_id === coleccionId).map((p) => p.place_id));
  return agruparLista(sitios.filter((s) => dentro.has(s.id))).flatMap((g) => g.sitios);
}

/** Sitios que se pueden añadir a la colección: los visibles que aún no están en ella, por nombre. */
export function sitiosAnadibles(coleccionId: string, sitios: Sitio[], pertenencias: Pertenencia[]): Sitio[] {
  const dentro = new Set(pertenencias.filter((p) => p.collection_id === coleccionId).map((p) => p.place_id));
  return sitios.filter((s) => !dentro.has(s.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Quién la comparte: «De un plan · compartida», «Privada · solo tú», «Compartida con Meri» o «De Meri · la ves tú». */
export function textoQuienComparte(
  c: Pick<Coleccion, 'created_by' | 'plan_id' | 'visible_to_partner'>,
  userId: string | undefined,
  nombrePareja: string | null,
): string {
  if (esDePlan(c)) return nombrePareja ? 'De un plan · compartida' : 'De un plan';
  if (!c.visible_to_partner) return 'Privada · solo tú';
  if (!nombrePareja) return 'Solo vosotros';
  return c.created_by && userId && c.created_by !== userId ? `De ${nombrePareja} · compartida contigo` : `Compartida con ${nombrePareja}`;
}
