/** Categorías de sitio: etiquetas, iconos de Ionicons y su equivalente en el calendario (docs/plan-mapa.md §5.2). */
import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

import type { CategoriaEvento } from '@/lib/calendario/evento';
import type { CategoriaSitio } from '@/lib/mapa/tipos';

type Icono = ComponentProps<typeof Ionicons>['name'];

export const INFO_CATEGORIA_SITIO: Record<CategoriaSitio, { etiqueta: string; plural: string; icono: Icono }> = {
  restaurant: { etiqueta: 'Restaurante', plural: 'Restaurantes', icono: 'restaurant' },
  bar: { etiqueta: 'Bar', plural: 'Bares', icono: 'beer' },
  cafe: { etiqueta: 'Café', plural: 'Cafés', icono: 'cafe' },
  leisure: { etiqueta: 'Ocio', plural: 'Ocio', icono: 'ticket' },
  getaway: { etiqueta: 'Escapada', plural: 'Escapadas', icono: 'airplane' },
  other: { etiqueta: 'Otro', plural: 'Otros', icono: 'location' },
};

/** Orden en los menús de filtros. */
export const CATEGORIAS_SITIO: CategoriaSitio[] = ['restaurant', 'bar', 'cafe', 'leisure', 'getaway', 'other'];

/** Categoría del calendario para «Planear aquí». */
export const CATEGORIA_CALENDARIO: Record<CategoriaSitio, CategoriaEvento> = {
  restaurant: 'eating_out',
  bar: 'eating_out',
  cafe: 'eating_out',
  leisure: 'leisure',
  getaway: 'trip',
  other: 'other',
};

const POR_TIPO: [RegExp, CategoriaSitio][] = [
  [/(^|_)(bar|pub|night_club|wine_bar|cocktail_bar)$/, 'bar'],
  [/(^|_)(cafe|coffee_shop|bakery|tea_house|ice_cream_shop)$/, 'cafe'],
  [/restaurant|food|meal_takeaway|pizza|steak_house/, 'restaurant'],
  [/lodging|hotel|resort|campground|guest_house|hostel/, 'getaway'],
  [/park|museum|cinema|movie_theater|amusement|zoo|aquarium|stadium|art_gallery|theater|tourist_attraction|spa/, 'leisure'],
];

/** `primaryType` de Google Places (p. ej. `italian_restaurant`) → categoría del sitio. */
export function categoriaDesdeTipo(tipo: string | null | undefined): CategoriaSitio {
  if (!tipo) return 'other';
  return POR_TIPO.find(([re]) => re.test(tipo))?.[1] ?? 'other';
}
