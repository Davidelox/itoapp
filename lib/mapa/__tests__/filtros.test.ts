import { SIN_FILTROS_MAPA, alternarFiltroMapa, contarFiltros, depurarFiltros, filtrarMapa, opcionesActivas, resumenFiltrosMapa } from '@/lib/mapa/filtros';
import type { Sitio } from '@/lib/mapa/tipos';

const sitio = (o: Partial<Sitio> = {}): Sitio => ({
  id: 'a',
  name: 'Taberna',
  address: null,
  lat: 40,
  lng: -3,
  category: 'restaurant',
  status: 'been',
  visible_to_partner: true,
  primary_collection_id: null,
  created_by: 'yo',
  version: 1,
  created_at: '2026-01-01T00:00:00Z',
  place_notes: [],
  ...o,
});

const todos = [
  sitio({ id: '1' }),
  sitio({ id: '2', created_by: 'ella', category: 'bar', status: 'want_to_go' }),
  sitio({ id: '3', visible_to_partner: false, category: 'cafe' }),
  sitio({ id: '4', created_by: null }),
];
const ids = (l: Sitio[]) => l.map((s) => s.id);

describe('filtrarMapa', () => {
  it('sin filtros devuelve todo', () => expect(filtrarMapa(todos, SIN_FILTROS_MAPA, 'yo')).toHaveLength(4));
  it('míos: solo los que guardé yo', () => expect(ids(filtrarMapa(todos, { ...SIN_FILTROS_MAPA, autores: ['mio'] }, 'yo'))).toEqual(['1', '3']));
  it('de la pareja: de otra persona, no los de cuenta borrada', () =>
    expect(ids(filtrarMapa(todos, { ...SIN_FILTROS_MAPA, autores: ['pareja'] }, 'yo'))).toEqual(['2']));
  it('míos o pareja suma los dos', () =>
    expect(ids(filtrarMapa(todos, { ...SIN_FILTROS_MAPA, autores: ['mio', 'pareja'] }, 'yo'))).toEqual(['1', '2', '3']));
  it('privados / compartidos', () => {
    expect(ids(filtrarMapa(todos, { ...SIN_FILTROS_MAPA, visibilidad: ['privado'] }, 'yo'))).toEqual(['3']);
    expect(ids(filtrarMapa(todos, { ...SIN_FILTROS_MAPA, visibilidad: ['compartido'] }, 'yo'))).toEqual(['1', '2', '4']);
  });
  it('entre grupos es «y»', () =>
    expect(ids(filtrarMapa(todos, { ...SIN_FILTROS_MAPA, estados: ['been'], autores: ['mio'], visibilidad: ['privado'] }, 'yo'))).toEqual(['3']));
  it('categoría y estado siguen funcionando', () =>
    expect(ids(filtrarMapa(todos, { ...SIN_FILTROS_MAPA, categorias: ['bar'], estados: ['want_to_go'] }, 'yo'))).toEqual(['2']));
  it('sin usuario, «míos» no devuelve nada', () => expect(filtrarMapa(todos, { ...SIN_FILTROS_MAPA, autores: ['mio'] }, null)).toEqual([]));
});

describe('alternar, contar y resumir', () => {
  it('marca y desmarca, en el orden del menú', () => {
    let f = alternarFiltroMapa(SIN_FILTROS_MAPA, 'categorias', 'cafe');
    f = alternarFiltroMapa(f, 'categorias', 'restaurant');
    expect(f.categorias).toEqual(['restaurant', 'cafe']);
    expect(alternarFiltroMapa(f, 'categorias', 'cafe').categorias).toEqual(['restaurant']);
    expect(SIN_FILTROS_MAPA.categorias).toEqual([]);
  });
  it('cuenta y lista las activas', () => {
    const f = alternarFiltroMapa(alternarFiltroMapa(SIN_FILTROS_MAPA, 'estados', 'been'), 'visibilidad', 'privado');
    expect(contarFiltros(f)).toBe(2);
    expect(opcionesActivas(f).map((o) => o.etiqueta)).toEqual(['Hemos ido', 'Privados']);
    expect(resumenFiltrosMapa(f)).toBe('Hemos ido y Privados');
  });
  it('resumen sin y con uno', () => {
    expect(resumenFiltrosMapa(SIN_FILTROS_MAPA)).toBe('sin filtros');
    expect(resumenFiltrosMapa(alternarFiltroMapa(SIN_FILTROS_MAPA, 'estados', 'want_to_go'))).toBe('Quiero ir');
  });
});

describe('filtro por colecciones', () => {
  const pertenencias = [
    { collection_id: 'c1', place_id: '1', added_at: 't' },
    { collection_id: 'c2', place_id: '2', added_at: 't' },
    { collection_id: 'c2', place_id: '3', added_at: 't' },
  ];
  const cols = [
    { id: 'c1', name: 'Ramen', icon: '🍜' },
    { id: 'c2', name: 'Escapadas', icon: '🏖️' },
  ];
  it('una colección: solo sus sitios', () =>
    expect(ids(filtrarMapa(todos, { ...SIN_FILTROS_MAPA, colecciones: ['c2'] }, 'yo', pertenencias))).toEqual(['2', '3']));
  it('varias: «o» entre ellas', () =>
    expect(ids(filtrarMapa(todos, { ...SIN_FILTROS_MAPA, colecciones: ['c1', 'c2'] }, 'yo', pertenencias))).toEqual(['1', '2', '3']));
  it('«y» con los demás grupos', () =>
    expect(ids(filtrarMapa(todos, { ...SIN_FILTROS_MAPA, colecciones: ['c2'], categorias: ['bar'] }, 'yo', pertenencias))).toEqual(['2']));
  it('alternar y contar', () => {
    const f = alternarFiltroMapa(alternarFiltroMapa(SIN_FILTROS_MAPA, 'colecciones', 'c1'), 'colecciones', 'c2');
    expect(f.colecciones).toEqual(['c1', 'c2']);
    expect(contarFiltros(f)).toBe(2);
    expect(alternarFiltroMapa(f, 'colecciones', 'c1').colecciones).toEqual(['c2']);
  });
  it('píldoras y resumen con el nombre de la colección', () => {
    const f = { ...SIN_FILTROS_MAPA, estados: ['been' as const], colecciones: ['c2'] };
    expect(opcionesActivas(f, cols).map((o) => o.etiqueta)).toEqual(['Hemos ido', 'Escapadas']);
    expect(opcionesActivas(f, cols)[1].emoji).toBe('🏖️');
    expect(resumenFiltrosMapa(f, cols)).toBe('Hemos ido y Escapadas');
  });
  it('depurar quita las colecciones que ya no existen', () => {
    expect(depurarFiltros({ ...SIN_FILTROS_MAPA, colecciones: ['c1', 'borrada'] }, cols).colecciones).toEqual(['c1']);
    expect(depurarFiltros(SIN_FILTROS_MAPA, cols)).toBe(SIN_FILTROS_MAPA);
  });
});
