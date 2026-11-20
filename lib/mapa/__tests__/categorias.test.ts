import { CATEGORIAS_SITIO, CATEGORIA_CALENDARIO, INFO_CATEGORIA_SITIO, categoriaDesdeTipo } from '@/lib/mapa/categorias';

describe('categoriaDesdeTipo', () => {
  it.each([
    ['italian_restaurant', 'restaurant'],
    ['restaurant', 'restaurant'],
    ['bar', 'bar'],
    ['wine_bar', 'bar'],
    ['cafe', 'cafe'],
    ['coffee_shop', 'cafe'],
    ['hotel', 'getaway'],
    ['campground', 'getaway'],
    ['museum', 'leisure'],
    ['movie_theater', 'leisure'],
    ['gas_station', 'other'],
  ])('%s → %s', (tipo, esperada) => {
    expect(categoriaDesdeTipo(tipo)).toBe(esperada);
  });
  it('sin tipo, otro', () => {
    expect(categoriaDesdeTipo(null)).toBe('other');
    expect(categoriaDesdeTipo(undefined)).toBe('other');
    expect(categoriaDesdeTipo('')).toBe('other');
  });
});

describe('tablas de categorías', () => {
  it('todas las categorías tienen etiqueta, icono y equivalente en el calendario', () => {
    for (const c of CATEGORIAS_SITIO) {
      expect(INFO_CATEGORIA_SITIO[c].etiqueta).toBeTruthy();
      expect(INFO_CATEGORIA_SITIO[c].icono).toBeTruthy();
      expect(CATEGORIA_CALENDARIO[c]).toBeTruthy();
    }
    expect(CATEGORIA_CALENDARIO).toMatchObject({ restaurant: 'eating_out', bar: 'eating_out', cafe: 'eating_out', leisure: 'leisure', getaway: 'trip', other: 'other' });
  });
});
