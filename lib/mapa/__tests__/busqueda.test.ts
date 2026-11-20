import { MENSAJE_LIMITE, MENSAJE_SIN_BUSQUEDA, MENSAJE_TIMEOUT, leerResultados, mensajeErrorBusqueda, mensajeErrorDirecto, textoBuscable } from '@/lib/mapa/busqueda';
import { SIN_CONEXION } from '@/lib/mapa/error';

const ok = { provider: 'photon', provider_place_id: 'N1', nombre: 'Casa', direccion: null, lat: 40, lng: -3, categoria: 'bar' };

describe('textoBuscable', () => {
  it('exige 2 letras y recorta espacios', () => {
    expect(textoBuscable(' a ')).toBeNull();
    expect(textoBuscable('  ca   sa ')).toBe('ca sa');
    expect(textoBuscable('x'.repeat(150))).toHaveLength(100);
  });
});

describe('leerResultados', () => {
  it('deja los válidos y descarta el resto', () => {
    expect(leerResultados({ resultados: [ok, { ...ok, categoria: 'zzz' }, { ...ok, lat: 'x' }, null, { ...ok, direccion: 'Calle 1' }] })).toHaveLength(2);
  });
  it('forma inesperada → vacío', () => {
    expect(leerResultados(null)).toEqual([]);
    expect(leerResultados({ resultados: 3 })).toEqual([]);
  });
});

describe('mensajeErrorBusqueda', () => {
  it('traduce por estado y nombre', () => {
    expect(mensajeErrorBusqueda({ name: 'FunctionsFetchError' })).toBe(SIN_CONEXION);
    expect(mensajeErrorBusqueda({ name: 'FunctionsHttpError', context: { status: 429 } })).toBe(MENSAJE_LIMITE);
    expect(mensajeErrorBusqueda({ name: 'FunctionsHttpError', context: { status: 503 } })).toBe(MENSAJE_SIN_BUSQUEDA);
    expect(mensajeErrorBusqueda(null)).toBe(MENSAJE_SIN_BUSQUEDA);
  });
});

describe('mensajeErrorDirecto', () => {
  it('traduce red, plazo y estado HTTP', () => {
    expect(mensajeErrorDirecto({ tipo: 'red' })).toBe(SIN_CONEXION);
    expect(mensajeErrorDirecto({ tipo: 'timeout' })).toBe(MENSAJE_TIMEOUT);
    expect(mensajeErrorDirecto({ estado: 429 })).toBe(MENSAJE_LIMITE);
    expect(mensajeErrorDirecto({ estado: 403 })).toBe(MENSAJE_SIN_BUSQUEDA);
    expect(mensajeErrorDirecto({ estado: 503 })).toBe(MENSAJE_SIN_BUSQUEDA);
  });
});
