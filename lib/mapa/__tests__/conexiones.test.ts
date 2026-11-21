import { avisarSitioPrivado, buscarEnSitios, juntarPlanes, nombreDeSitio, paramsPlanearAqui, sitioDeParametro, sitioEnlazado } from '@/lib/mapa/conexiones';
import type { Sitio } from '@/lib/mapa/tipos';

const sitio = (id: string, name: string, address: string | null = null, category: Sitio['category'] = 'restaurant'): Sitio => ({
  id,
  name,
  address,
  lat: 0,
  lng: 0,
  category,
  status: 'want_to_go',
  visible_to_partner: true,
  primary_collection_id: null,
  created_by: 'u1',
  version: 1,
  created_at: '2026-11-01T10:00:00Z',
  place_notes: [],
});

const sitios = [sitio('a', 'Taberna El Olivo', 'Calle Mayor 12'), sitio('b', 'Café Central', 'Plaza Nueva 3'), sitio('c', 'Bar Pepe')];

describe('buscarEnSitios', () => {
  it('sin texto devuelve todos por orden alfabético', () => {
    expect(buscarEnSitios(sitios, '  ').map((s) => s.id)).toEqual(['c', 'b', 'a']);
  });
  it('ignora tildes y mayúsculas, y busca también en la dirección', () => {
    expect(buscarEnSitios(sitios, 'CAFE').map((s) => s.id)).toEqual(['b']);
    expect(buscarEnSitios(sitios, 'mayor').map((s) => s.id)).toEqual(['a']);
  });
  it('sin coincidencias, vacío', () => {
    expect(buscarEnSitios(sitios, 'zzz')).toEqual([]);
  });
});

describe('nombreDeSitio', () => {
  it('da el nombre si se ve y null si no hay sitio, no se ve o no ha cargado', () => {
    expect(nombreDeSitio(sitios, 'a')).toBe('Taberna El Olivo');
    expect(nombreDeSitio(sitios, 'x')).toBeNull();
    expect(nombreDeSitio(sitios, null)).toBeNull();
    expect(nombreDeSitio(undefined, 'a')).toBeNull();
  });
});

describe('paramsPlanearAqui', () => {
  it('lleva hoy, la categoría del calendario y el sitio', () => {
    expect(paramsPlanearAqui({ id: 's1', category: 'getaway' }, '2026-11-20')).toEqual({ fecha: '2026-11-20', categoria: 'trip', sitio: 's1' });
    expect(paramsPlanearAqui({ id: 's2', category: 'bar' }, '2026-11-20').categoria).toBe('eating_out');
  });
});

describe('sitioDeParametro', () => {
  it('acepta solo un uuid', () => {
    expect(sitioDeParametro('0F8FAD5B-D9CB-469F-A165-70867728950E')).toBe('0f8fad5b-d9cb-469f-a165-70867728950e');
    expect(sitioDeParametro('hola')).toBeNull();
    expect(sitioDeParametro(undefined)).toBeNull();
  });
});

describe('juntarPlanes', () => {
  it('mezcla eventos y gastos, lo más reciente primero', () => {
    const r = juntarPlanes(
      [{ id: 'e1', title: 'Cena', start_date: '2026-11-10' }],
      [{ id: 'g1', concept: 'Cena', spent_on: '2026-11-12', amount_cents: 4200 }],
    );
    expect(r.map((x) => `${x.tipo}:${x.id}`)).toEqual(['gasto:g1', 'evento:e1']);
    expect(r[0].importe_cents).toBe(4200);
    expect(r[1].importe_cents).toBeNull();
  });
});

describe('sitioEnlazado', () => {
  it('distingue sin sitio, cargando, visible y no disponible', () => {
    expect(sitioEnlazado(sitios, null)).toEqual({ tipo: 'ninguno' });
    expect(sitioEnlazado(undefined, 'a')).toEqual({ tipo: 'cargando' });
    expect(sitioEnlazado(sitios, 'a')).toEqual({ tipo: 'visible', sitio: sitios[0] });
    expect(sitioEnlazado(sitios, 'x')).toEqual({ tipo: 'no_disponible' });
  });
});

describe('avisarSitioPrivado', () => {
  const privado = { visible_to_partner: false };
  it('avisa solo con sitio privado, algo compartido y pareja unida', () => {
    expect(avisarSitioPrivado(privado, true, true)).toBe(true);
    expect(avisarSitioPrivado({ visible_to_partner: true }, true, true)).toBe(false);
    expect(avisarSitioPrivado(privado, false, true)).toBe(false);
    expect(avisarSitioPrivado(privado, true, false)).toBe(false);
    expect(avisarSitioPrivado(undefined, true, true)).toBe(false);
  });
});
