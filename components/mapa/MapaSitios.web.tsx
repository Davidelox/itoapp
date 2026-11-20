import type { Sitio } from '@/lib/mapa/tipos';

/** En web no hay mapa (`react-native-maps` no lo soporta): la pestaña enseña solo la Lista (docs/plan-mapa.md §2). */
export const HAY_MAPA = false;

export function MapaSitios(_props: { sitios: Sitio[]; seleccionado: string | null; conPlan?: ReadonlySet<string>; onSeleccionar: (id: string | null) => void; onMantener?: (lat: number, lng: number) => void; resultados?: unknown[]; resultadoSel?: string | null; onResultado?: (id: string | null) => void; onRegion?: (r: unknown) => void; enfoque?: { lat: number; lng: number; clave: number } | null }) {
  return null;
}
