import { SIN_FILTROS, agruparLista, etiquetaAccesible, filtrarSitios, quienGuardo, textoEstrellas, textoSecundario, textoValoracionHablado, valoracionDe } from '@/lib/mapa/lista';
import type { Sitio } from '@/lib/mapa/tipos';

const sitio = (o: Partial<Sitio> = {}): Sitio => ({
  id: 'a',
  name: 'Taberna El Olivo',
  address: 'Calle Mayor 12',
  lat: 40,
  lng: -3,
  category: 'restaurant',
  status: 'been',
  visible_to_partner: true,
  primary_collection_id: null,
  created_by: 'u1',
  version: 1,
  created_at: '2026-01-01T00:00:00Z',
  place_notes: [],
  ...o,
});

describe('agruparLista', () => {
  it('Quiero ir primero, luego Hemos ido, el más reciente primero', () => {
    const grupos = agruparLista([
      sitio({ id: '1', status: 'been', created_at: '2026-01-01T00:00:00Z' }),
      sitio({ id: '2', status: 'want_to_go', created_at: '2026-02-01T00:00:00Z' }),
      sitio({ id: '3', status: 'want_to_go', created_at: '2026-03-01T00:00:00Z' }),
      sitio({ id: '4', status: 'been', created_at: '2026-05-01T00:00:00Z' }),
    ]);
    expect(grupos.map((g) => g.titulo)).toEqual(['Quiero ir', 'Hemos ido']);
    expect(grupos[0].sitios.map((s) => s.id)).toEqual(['3', '2']);
    expect(grupos[1].sitios.map((s) => s.id)).toEqual(['4', '1']);
  });
  it('omite los grupos vacíos y no modifica la entrada', () => {
    const entrada = [sitio({ id: '1', status: 'been' })];
    expect(agruparLista(entrada).map((g) => g.estado)).toEqual(['been']);
    expect(agruparLista([])).toEqual([]);
  });
  it('con la misma fecha desempata por nombre', () => {
    const g = agruparLista([sitio({ id: 'b', name: 'Zeta' }), sitio({ id: 'a', name: 'Alfa' })]);
    expect(g[0].sitios.map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('filtrarSitios', () => {
  const todos = [
    sitio({ id: '1', status: 'been', category: 'restaurant' }),
    sitio({ id: '2', status: 'want_to_go', category: 'bar' }),
    sitio({ id: '3', status: 'want_to_go', category: 'getaway' }),
  ];
  it('sin filtros, todos', () => expect(filtrarSitios(todos, SIN_FILTROS)).toHaveLength(3));
  it('«o» dentro de un grupo', () => {
    expect(filtrarSitios(todos, { estados: [], categorias: ['bar', 'getaway'] }).map((s) => s.id)).toEqual(['2', '3']);
  });
  it('«y» entre grupos', () => {
    expect(filtrarSitios(todos, { estados: ['want_to_go'], categorias: ['bar'] }).map((s) => s.id)).toEqual(['2']);
  });
});

describe('textos', () => {
  it('textoSecundario', () => {
    expect(textoSecundario(sitio())).toBe('Restaurante · Calle Mayor 12');
    expect(textoSecundario(sitio({ address: null }))).toBe('Restaurante');
    expect(textoSecundario(sitio({ address: '  ', category: 'bar' }))).toBe('Bar');
  });
  it('etiquetaAccesible', () => {
    expect(etiquetaAccesible(sitio({ visible_to_partner: false }))).toBe('Taberna El Olivo, restaurante, hemos ido, privado');
    expect(etiquetaAccesible(sitio({ status: 'want_to_go', category: 'getaway' }))).toBe('Taberna El Olivo, escapada, quiero ir');
  });
  it('valoraciones', () => {
    expect(textoEstrellas(4.5)).toBe('4,5');
    expect(textoEstrellas(4)).toBe('4');
    expect(textoValoracionHablado(4.5)).toBe('4 y medio de 5');
    expect(textoValoracionHablado(3)).toBe('3 de 5');
    expect(textoValoracionHablado(0.5)).toBe('0 y medio de 5');
  });
  it('valoracionDe', () => {
    const s = sitio({ place_notes: [{ user_id: 'u1', rating: 4.5, note: null }, { user_id: 'u2', rating: null, note: 'x' }] });
    expect(valoracionDe(s, 'u1')).toBe(4.5);
    expect(valoracionDe(s, 'u2')).toBeNull();
    expect(valoracionDe(s, 'u3')).toBeNull();
    expect(valoracionDe(s, null)).toBeNull();
  });
  it('quienGuardo', () => {
    expect(quienGuardo(sitio(), 'u1', 'u2')).toBe('yo');
    expect(quienGuardo(sitio({ created_by: 'u2' }), 'u1', 'u2')).toBe('otra');
    expect(quienGuardo(sitio({ created_by: null }), 'u1', 'u2')).toBeNull();
    expect(quienGuardo(sitio({ created_by: 'u9' }), 'u1', null)).toBeNull();
  });
});
