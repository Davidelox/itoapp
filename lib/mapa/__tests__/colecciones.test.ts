import {
  SIN_SELECCION,
  coleccionesDeSitio,
  contarSitios,
  elegirColeccion,
  etiquetaMantener,
  hacerPrincipal,
  hayCambiosColecciones,
  iconosDePin,
  pareceEmoji,
  pasosGuardado,
  primerEmoji,
  resolverTextoIcono,
  puedeCambiarVisibilidad,
  quitarDeLasDemas,
  sitiosAnadibles,
  sitiosDeColeccion,
  textoContadorSitios,
  textoQuienComparte,
  textoPreguntaQuitar,
  validarColeccion,
} from '@/lib/mapa/colecciones';
import type { Coleccion, Pertenencia, Sitio } from '@/lib/mapa/tipos';

const col = (id: string, icon: string, o: Partial<Coleccion> = {}): Coleccion => ({
  id,
  name: `Col ${id}`,
  icon,
  plan_id: null,
  visible_to_partner: true,
  created_by: 'yo',
  version: 1,
  created_at: '2026-01-01T00:00:00Z',
  ...o,
});
const per = (collection_id: string, place_id: string, added_at: string): Pertenencia => ({ collection_id, place_id, added_at });

describe('validarColeccion', () => {
  it('acepta nombre y emoji', () => expect(validarColeccion({ nombre: ' Ramen ', icono: '🍣' })).toEqual({ nombre: null, icono: null }));
  it('nombre vacío o de solo espacios', () => expect(validarColeccion({ nombre: '   ', icono: '🍣' }).nombre).toMatch(/nombre/));
  it('nombre de más de 60', () => {
    expect(validarColeccion({ nombre: 'a'.repeat(60), icono: '🍣' }).nombre).toBeNull();
    expect(validarColeccion({ nombre: 'a'.repeat(61), icono: '🍣' }).nombre).toMatch(/60/);
  });
  it('icono vacío, letra o número no valen', () => {
    for (const i of ['', 'a', '7', 'ñ']) expect(validarColeccion({ nombre: 'x', icono: i }).icono).not.toBeNull();
  });
  it('icono de más de 16 puntos de código', () => expect(pareceEmoji('🍣'.repeat(17))).toBe(false));
  it('acepta símbolos, banderas y secuencias', () => {
    for (const i of ['⭐', '🏖️', '🇪🇸', '👨‍👩‍👧', '👍🏽', '❤️']) expect(pareceEmoji(i)).toBe(true);
  });
});

describe('primerEmoji', () => {
  it('se queda con el primero', () => expect(primerEmoji('🍣🍕')).toBe('🍣'));
  it('mantiene variación, tono de piel y uniones', () => {
    expect(primerEmoji('🏖️🍕')).toBe('🏖️');
    expect(primerEmoji('👍🏽x')).toBe('👍🏽');
    expect(primerEmoji('👨‍👩‍👧🍕')).toBe('👨‍👩‍👧');
  });
  it('una bandera son dos indicadores', () => expect(primerEmoji('🇪🇸🇫🇷')).toBe('🇪🇸'));
  it('vacío', () => expect(primerEmoji('  ')).toBe(''));
});

describe('elegirColeccion', () => {
  it('la primera pasa a ser la principal y no se pregunta', () => {
    expect(elegirColeccion(SIN_SELECCION, 'a')).toEqual({ seleccion: { ids: ['a'], principal: 'a' }, preguntar: [] });
  });
  it('al añadir una segunda se pregunta por las anteriores y la principal no cambia', () => {
    expect(elegirColeccion({ ids: ['a'], principal: 'a' }, 'b')).toEqual({ seleccion: { ids: ['a', 'b'], principal: 'a' }, preguntar: ['a'] });
    expect(elegirColeccion({ ids: ['a', 'b'], principal: 'b' }, 'c').preguntar).toEqual(['a', 'b']);
  });
  it('quitar la principal pasa a la primera que quede; sin ninguna, null', () => {
    expect(elegirColeccion({ ids: ['a', 'b'], principal: 'a' }, 'a').seleccion).toEqual({ ids: ['b'], principal: 'b' });
    expect(elegirColeccion({ ids: ['a'], principal: 'a' }, 'a').seleccion).toEqual(SIN_SELECCION);
  });
  it('quitar otra no toca la principal', () => {
    expect(elegirColeccion({ ids: ['a', 'b'], principal: 'a' }, 'b').seleccion).toEqual({ ids: ['a'], principal: 'a' });
  });
});

describe('principal y pregunta', () => {
  it('quitarDeLasDemas deja solo la nueva como principal', () => expect(quitarDeLasDemas('b')).toEqual({ ids: ['b'], principal: 'b' }));
  it('hacerPrincipal ignora una colección que no está elegida', () => {
    const s = { ids: ['a', 'b'], principal: 'a' };
    expect(hacerPrincipal(s, 'b').principal).toBe('b');
    expect(hacerPrincipal(s, 'z')).toBe(s);
  });
  it('textos de la pregunta', () => {
    expect(textoPreguntaQuitar([{ icon: '🍣', name: 'Sushi' }])).toBe('¿Quitarlo de 🍣 Sushi?');
    expect(textoPreguntaQuitar([{ icon: '🍣', name: 'Sushi' }, { icon: '🍕', name: 'Pizza' }])).toBe('¿Quitarlo de 🍣 Sushi, 🍕 Pizza?');
    expect(etiquetaMantener(1)).toBe('Mantener en las dos');
    expect(etiquetaMantener(2)).toBe('Mantener en todas');
  });
});

describe('pasosGuardado', () => {
  it('sitio nuevo: la principal entra la primera y no hace falta fijarla', () => {
    expect(pasosGuardado(SIN_SELECCION, { ids: ['a', 'b'], principal: 'b' })).toEqual({ primero: ['b'], despues: ['a'], quitar: [], fijarPrincipal: null });
  });
  it('sin cambios no hay nada que escribir', () => {
    const s = { ids: ['a', 'b'], principal: 'a' };
    expect(hayCambiosColecciones(pasosGuardado(s, s))).toBe(false);
  });
  it('añadir a una segunda mantiene la principal', () => {
    expect(pasosGuardado({ ids: ['a'], principal: 'a' }, { ids: ['a', 'b'], principal: 'a' })).toEqual({ primero: [], despues: ['b'], quitar: [], fijarPrincipal: null });
  });
  it('hacer principal otra fija solo la principal', () => {
    expect(pasosGuardado({ ids: ['a', 'b'], principal: 'a' }, { ids: ['a', 'b'], principal: 'b' })).toEqual({ primero: [], despues: [], quitar: [], fijarPrincipal: 'b' });
  });
  it('«quitar de las demás»: borra las otras y fija la nueva', () => {
    expect(pasosGuardado({ ids: ['a', 'c'], principal: 'a' }, quitarDeLasDemas('b'))).toEqual({ primero: [], despues: ['b'], quitar: ['a', 'c'], fijarPrincipal: 'b' });
  });
  it('quedarse sin colecciones: solo quitar (el servidor deja la principal en null)', () => {
    expect(pasosGuardado({ ids: ['a'], principal: 'a' }, SIN_SELECCION)).toEqual({ primero: [], despues: [], quitar: ['a'], fijarPrincipal: null });
  });
});

describe('lecturas de colecciones', () => {
  const cs = [col('a', '🍣'), col('b', '🍕')];
  const ps = [per('b', 'p1', '2026-02-01'), per('a', 'p1', '2026-01-01'), per('a', 'p2', '2026-01-05'), per('x', 'p1', '2026-01-02')];
  it('colecciones de un sitio, por antigüedad y solo las que se ven', () => {
    expect(coleccionesDeSitio('p1', cs, ps).map((c) => c.id)).toEqual(['a', 'b']);
  });
  it('cuenta sitios por colección', () => expect(contarSitios(ps).get('a')).toBe(2));
  it('puedeCambiarVisibilidad: solo quien la creó, de privada a compartida y no la de un plan', () => {
    const privada = col('a', '🍣', { visible_to_partner: false });
    expect(puedeCambiarVisibilidad(privada, 'yo')).toBe(true);
    expect(puedeCambiarVisibilidad(privada, 'ella')).toBe(false);
    expect(puedeCambiarVisibilidad(col('a', '🍣'), 'yo')).toBe(false); // compartida: no vuelve a ser privada (TW054)
    expect(puedeCambiarVisibilidad(col('a', '🍣', { plan_id: 'p' }), 'yo')).toBe(false);
  });
});

describe('iconosDePin', () => {
  const cs = [col('a', '🍣'), col('b', '🍕')];
  const sitios = [
    { id: 'p1', primary_collection_id: 'a' },
    { id: 'p2', primary_collection_id: null },
    { id: 'p3', primary_collection_id: 'oculta' },
  ];
  const ps = [per('a', 'p1', 't'), per('b', 'p1', 't'), per('b', 'p2', 't')];
  it('usa la colección principal; sin ella o si no se ve, no hay emoji', () => {
    expect([...iconosDePin(sitios, cs, ps)]).toEqual([['p1', '🍣']]);
  });
  it('con una sola colección filtrada, manda esa a los sitios que están en ella', () => {
    expect([...iconosDePin(sitios, cs, ps, ['b'])]).toEqual([['p1', '🍕'], ['p2', '🍕']]);
  });
  it('con dos filtradas vuelve a la principal', () => {
    expect([...iconosDePin(sitios, cs, ps, ['a', 'b'])]).toEqual([['p1', '🍣']]);
  });
});

const sit = (id: string, name: string, status: Sitio['status'], created_at: string): Sitio => ({
  id,
  name,
  address: null,
  lat: 0,
  lng: 0,
  category: 'restaurant',
  status,
  visible_to_partner: true,
  primary_collection_id: null,
  created_by: 'yo',
  version: 1,
  created_at,
  place_notes: [],
});

describe('detalle de colección', () => {
  const T = '2026-01-01T00:00:00Z';
  const sitios = [
    sit('a', 'Zen', 'been', '2026-03-01T00:00:00Z'),
    sit('b', 'Bao', 'want_to_go', '2026-01-01T00:00:00Z'),
    sit('c', 'Ají', 'want_to_go', '2026-02-01T00:00:00Z'),
    sit('d', 'Dim sum', 'want_to_go', '2026-04-01T00:00:00Z'),
  ];
  const pert = [per('x', 'a', T), per('x', 'b', T), per('x', 'c', T), per('y', 'd', T), per('x', 'oculto', T)];

  it('ordena como la Lista y ignora los sitios que no se ven', () => {
    expect(sitiosDeColeccion('x', sitios, pert).map((s) => s.id)).toEqual(['c', 'b', 'a']);
    expect(sitiosDeColeccion('z', sitios, pert)).toEqual([]);
  });

  it('solo se pueden añadir los visibles que aún no están, por nombre', () => {
    expect(sitiosAnadibles('x', sitios, pert).map((s) => s.id)).toEqual(['d']);
    expect(sitiosAnadibles('y', sitios, pert).map((s) => s.id)).toEqual(['c', 'b', 'a']);
    expect(sitiosAnadibles('x', [], pert)).toEqual([]);
  });

  it('textos de contador y de quién la comparte', () => {
    expect([0, 1, 12].map(textoContadorSitios)).toEqual(['0 sitios', '1 sitio', '12 sitios']);
    const base = { created_by: 'yo', plan_id: null, visible_to_partner: true };
    expect(textoQuienComparte(base, 'yo', 'Meri')).toBe('Compartida con Meri');
    expect(textoQuienComparte(base, 'meri', 'Meri')).toBe('De Meri · compartida contigo');
    expect(textoQuienComparte({ ...base, visible_to_partner: false }, 'yo', 'Meri')).toBe('Privada · solo tú');
    expect(textoQuienComparte({ ...base, plan_id: 'p' }, 'yo', 'Meri')).toBe('De un plan · compartida');
    expect(textoQuienComparte(base, 'yo', null)).toBe('Solo vosotros');
  });
});

describe('resolverTextoIcono', () => {
  it('un emoji se elige y cierra', () => expect(resolverTextoIcono('🍣', '📍')).toEqual({ icono: '🍣', cerrar: true }));
  it('reemplazo: se queda con el primero', () => expect(resolverTextoIcono('🍣🍕', '📍').icono).toBe('🍣'));
  it('vacío vuelve al defecto sin cerrar', () => expect(resolverTextoIcono('', '📍')).toEqual({ icono: '📍', cerrar: false }));
});
