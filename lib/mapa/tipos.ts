/** Tipos del Mapa (docs/plan-mapa.md §4): mismos enums que `place_category` y `place_status`. */
export type CategoriaSitio = 'restaurant' | 'bar' | 'cafe' | 'leisure' | 'getaway' | 'other';
export type EstadoSitio = 'want_to_go' | 'been';

/** Valoración y nota de una persona sobre un sitio (`place_notes`). */
export type NotaSitio = { user_id: string; rating: number | null; note: string | null };

/** Fila de `places` con las notas de cada uno incrustadas. */
export type Sitio = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  category: CategoriaSitio;
  status: EstadoSitio;
  visible_to_partner: boolean;
  /** Colección cuyo icono lleva el pin (la fija un trigger); null = icono de la categoría. */
  primary_collection_id: string | null;
  created_by: string | null;
  version: number;
  created_at: string;
  place_notes: NotaSitio[];
};

/** Fila de la vista `place_stats` (la ficha: visitas apuntadas, gastado y próximo plan). */
export type EstadisticasSitio = {
  place_id: string;
  visit_count: number;
  total_spent_cents: number;
  next_event_on: string | null;
  /** Fecha de la última visita apuntada (`place_visits`), o null. */
  last_visit_on: string | null;
  /** Fecha de un evento ya terminado o un gasto del sitio posterior a la última visita: «¿Fuisteis el vie 14?». */
  suggested_visit_on: string | null;
};

/** Fila de `collections` (el icono es un emoji, 1 a 16 caracteres). `plan_id`: colección automática de un plan. */
export type Coleccion = {
  id: string;
  name: string;
  icon: string;
  plan_id: string | null;
  visible_to_partner: boolean;
  created_by: string | null;
  version: number;
  created_at: string;
};

/** Fila de `collection_places`: un sitio dentro de una colección. */
export type Pertenencia = { collection_id: string; place_id: string; added_at: string; /** Quién lo metió en la colección. */ added_by?: string | null };
