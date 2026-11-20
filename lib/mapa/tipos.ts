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
  created_by: string | null;
  version: number;
  created_at: string;
  place_notes: NotaSitio[];
};

/** Fila de la vista `place_stats` (la ficha: visitas, gastado y próximo plan). */
export type EstadisticasSitio = {
  place_id: string;
  visit_count: number;
  total_spent_cents: number;
  next_event_on: string | null;
};
