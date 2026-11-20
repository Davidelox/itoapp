import type { Sitio } from '@/lib/mapa/tipos';

/** En web no hay mapa (`react-native-maps` no lo soporta): la pestaña enseña solo la Lista (docs/plan-mapa.md §2). */
export const HAY_MAPA = false;

export function MapaSitios(_props: { sitios: Sitio[]; seleccionado: string | null; conPlan?: ReadonlySet<string>; onSeleccionar: (id: string | null) => void; onMantener?: (lat: number, lng: number) => void }) {
  return null;
}
