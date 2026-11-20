import type { SitioBuscado } from '@/lib/mapa/busqueda';
import { urlPhoton } from '@/lib/mapa/photon';
import {
  esBusquedaDeCadena,
  esConsultaGenerica,
  formatoDistancia,
  fusionarConGuardados,
  leerCentro,
  leerParamsGuardar,
  lineaResultado,
  ordenarResultados,
  MAX_SUGERENCIAS,
  paramsGuardar,
  planZoom,
  textoSugerible,
  regionDeResultado,
  regionMovida,
} from '@/lib/mapa/resultados';
import { distanciaMetros } from '@/lib/mapa/sitio';
import type { Sitio } from '@/lib/mapa/tipos';

const sol = { lat: 40.4168, lng: -3.7038 };
const r = (id: number, nombre: string, lat: number, lng: number): SitioBuscado => ({
  provider: 'photon',
  provider_place_id: `N${id}`,
  nombre,
  direccion: null,
  lat,
  lng,
  categoria: 'restaurant',
});

describe('distanciaMetros (haversine)', () => {
  it('Puerta del Sol a Atocha, ~1,6 km', () => {
    const d = distanciaMetros(sol, { lat: 40.4065, lng: -3.6892 });
    expect(d).toBeGreaterThan(1500);
    expect(d).toBeLessThan(1900);
  });
  it('mismo punto → 0', () => expect(distanciaMetros(sol, sol)).toBe(0));
});

describe('formatoDistancia', () => {
  it.each([
    [3, '10 m'],
    [447, '450 m'],
    [994, '990 m'],
    [996, '1 km'],
    [1000, '1 km'],
    [1234, '1,2 km'],
    [9949, '9,9 km'],
    [9960, '10 km'],
    [12400, '12 km'],
    [125000, '125 km'],
  ])('%s m → %s', (m, t) => expect(formatoDistancia(m)).toBe(t));
  it('valor inválido → vacío', () => {
    expect(formatoDistancia(NaN)).toBe('');
    expect(formatoDistancia(-5)).toBe('');
  });
});

describe('esConsultaGenerica', () => {
  it('una palabra sí; dos no', () => {
    expect(esConsultaGenerica('KFC')).toBe(true);
    expect(esConsultaGenerica('  Farmacia ')).toBe(true);
    expect(esConsultaGenerica('KFC Atocha')).toBe(false);
  });
});

describe('orden por cercanía o relevancia', () => {
  const kfcs = [r(1, 'KFC', 40.43, -3.7), r(2, 'KFC', 40.418, -3.704), r(3, 'KFC', 40.5, -3.6), r(4, 'Kfc', 40.42, -3.71)];
  it('cadena: «KFC» → por distancia ascendente, con distancia', () => {
    const o = ordenarResultados(kfcs, 'KFC', sol);
    expect(o.map((x) => x.provider_place_id)).toEqual(['N2', 'N4', 'N1', 'N3']);
    expect(o.every((x) => typeof x.distanciaM === 'number')).toBe(true);
    expect(o[0].distanciaM).toBeLessThan(o[3].distanciaM as number);
  });
  it('los que no se llaman como la cadena van después, en su orden', () => {
    const mezcla = [r(9, 'Bar Pepe', 40.4168, -3.7038), ...kfcs];
    expect(ordenarResultados(mezcla, 'KFC', sol).map((x) => x.provider_place_id)).toEqual(['N2', 'N4', 'N1', 'N3', 'N9']);
  });
  it('concreto («KFC Atocha»): mantiene el orden de Photon, con distancia', () => {
    const o = ordenarResultados(kfcs, 'KFC Atocha', sol);
    expect(o.map((x) => x.provider_place_id)).toEqual(['N1', 'N2', 'N3', 'N4']);
    expect(o[0].distanciaM).toBeGreaterThan(0);
  });
  it('sin centro: orden de Photon y sin distancia', () => {
    const o = ordenarResultados(kfcs, 'KFC', null);
    expect(o.map((x) => x.provider_place_id)).toEqual(['N1', 'N2', 'N3', 'N4']);
    expect(o[0].distanciaM).toBeUndefined();
  });
  it('recorta a 8 por defecto y no muta la entrada', () => {
    const muchos = Array.from({ length: 12 }, (_, i) => r(i, 'KFC', 40.4 + i / 100, -3.7));
    expect(ordenarResultados(muchos, 'kfc', sol)).toHaveLength(8);
    expect(muchos[0].distanciaM).toBeUndefined();
  });
  it('esBusquedaDeCadena: necesita 2 coincidencias y el 60 %', () => {
    expect(esBusquedaDeCadena('KFC', [r(1, 'KFC', 0, 0)])).toBe(false);
    expect(esBusquedaDeCadena('KFC', [r(1, 'KFC Sol', 0, 0), r(2, 'KFC Atocha', 0, 0), r(3, 'Otro', 0, 0)])).toBe(true);
    expect(esBusquedaDeCadena('KFC', [r(1, 'KFC', 0, 0), r(2, 'Otro', 0, 0), r(3, 'Más', 0, 0)])).toBe(false);
    expect(esBusquedaDeCadena('', kfcs)).toBe(false);
  });
  it('ignora tildes y mayúsculas', () => {
    const cafes = [r(1, 'Café Central', 40.4, -3.7), r(2, 'CAFE central', 40.41, -3.7)];
    expect(esBusquedaDeCadena('cafe central', cafes)).toBe(true);
  });
});

describe('lineaResultado', () => {
  it('une dirección y distancia', () => {
    expect(lineaResultado({ direccion: 'Calle Mayor 1', distanciaM: 450 })).toBe('Calle Mayor 1 · 450 m');
    expect(lineaResultado({ direccion: null, distanciaM: 1234 })).toBe('1,2 km');
    expect(lineaResultado({ direccion: 'X', distanciaM: undefined })).toBe('X');
  });
});

describe('parámetros de «Guardar»', () => {
  const x: SitioBuscado = { ...r(7, 'Casa Lola', 40.41, -3.7), direccion: 'Calle Mayor 12', categoria: 'bar' };
  it('ida y vuelta', () => {
    expect(leerParamsGuardar(paramsGuardar(x))).toEqual({ nombre: 'Casa Lola', direccion: 'Calle Mayor 12', lat: 40.41, lng: -3.7, categoria: 'bar', lugarId: 'N7' });
  });
  it('dirección nula → vacía', () => expect(leerParamsGuardar(paramsGuardar(r(7, 'A', 1, 2)))?.direccion).toBe(''));
  it.each([
    ['sin lugarId', { lugarId: undefined }],
    ['lugarId raro', { lugarId: 'abc' }],
    ['categoría rara', { categoria: 'zzz' }],
    ['lat fuera', { lat: '99' }],
    ['lng vacía', { lng: '' }],
    ['sin nombre', { nombre: ' ' }],
  ])('rechaza %s', (_n, cambio) => expect(leerParamsGuardar({ ...paramsGuardar(x), ...cambio })).toBeNull());
  it('un alta por «mantener pulsado» (solo lat/lng) no es un prefill', () => expect(leerParamsGuardar({ lat: '40.4', lng: '-3.7' })).toBeNull());
  it('leerCentro', () => {
    expect(leerCentro({ cLat: '40.4', cLng: '-3.7' })).toEqual({ lat: 40.4, lng: -3.7 });
    expect(leerCentro({ cLat: 'x', cLng: '-3.7' })).toBeNull();
    expect(leerCentro({})).toBeNull();
  });
});

describe('fusionarConGuardados', () => {
  const guardado = { id: 's1', name: 'Casa Lola', lat: 40.41, lng: -3.7 } as Sitio;
  it('marca el que ya está guardado (mismo nombre a menos de 100 m)', () => {
    const f = fusionarConGuardados([r(1, 'casa lola', 40.4101, -3.7001), r(2, 'Casa Lola', 41, -3.7), r(3, 'Otro', 40.41, -3.7)], [guardado]);
    expect(f.map((x) => x.guardado?.id ?? null)).toEqual(['s1', null, null]);
  });
});

describe('regionMovida', () => {
  const base = { latitude: 40.4, longitude: -3.7, latitudeDelta: 0.1, longitudeDelta: 0.1 };
  it('pequeño desplazamiento: no', () => expect(regionMovida(base, { ...base, latitude: 40.41 })).toBe(false));
  it('desplazamiento grande: sí', () => expect(regionMovida(base, { ...base, longitude: -3.6 })).toBe(true));
  it('zoom claro: sí', () => {
    expect(regionMovida(base, { ...base, latitudeDelta: 0.2 })).toBe(true);
    expect(regionMovida(base, { ...base, latitudeDelta: 0.05 })).toBe(true);
    expect(regionMovida(base, { ...base, latitudeDelta: 0.11 })).toBe(false);
  });
});

describe('urlPhoton con límite y recuadro', () => {
  it('pide 20 y un bbox alrededor del centro redondeado', () => {
    const u = new URL(urlPhoton({ q: 'kfc', lat: 40.4168, lng: -3.7038 }, { limite: 20, bbox: true }));
    expect(u.searchParams.get('limit')).toBe('20');
    expect(u.searchParams.get('bbox')).toBe('-4.00,40.12,-3.40,40.72');
  });
  it('sin centro no hay bbox aunque se pida', () => expect(new URL(urlPhoton({ q: 'kfc', lat: null, lng: null }, { bbox: true })).searchParams.has('bbox')).toBe(false));
});

describe('regionDeResultado', () => {
  it('centra en el resultado con un zoom cercano', () => {
    expect(regionDeResultado({ lat: 40.41, lng: -3.7 })).toEqual({ latitude: 40.41, longitude: -3.7, latitudeDelta: 0.008, longitudeDelta: 0.008 });
  });
  it('el zoom programático sí cuenta como movimiento si no se protege (por eso hay ventana)', () => {
    const base = { latitude: 40.4, longitude: -3.7, latitudeDelta: 0.1, longitudeDelta: 0.1 };
    expect(regionMovida(base, regionDeResultado({ lat: 40.4, lng: -3.7 }))).toBe(true);
  });
});

describe('autocompletado', () => {
  it('umbral de 3 letras y limpieza de espacios', () => {
    expect(textoSugerible('ab')).toBeNull();
    expect(textoSugerible('  a  ')).toBeNull();
    expect(textoSugerible('  kfc  atocha ')).toBe('kfc atocha');
    expect(textoSugerible('kfc')).toBe('kfc');
  });
  it('máximo 5 sugerencias', () => expect(MAX_SUGERENCIAS).toBe(5));
});

describe('planZoom', () => {
  const a = { n: 'antes' };
  const z = { n: 'zoom' };
  const dest = { n: 'destino' };
  it('elegir el primero guarda la región previa y va al destino', () => {
    expect(planZoom('x', 'x', a, z, dest)).toEqual({ previa: a, ir: dest });
    expect(planZoom(null, 'x', null, a, dest)).toEqual({ previa: a, ir: dest });
  });
  it('elegir otro no pisa la región previa', () => expect(planZoom('x', 'y', a, z, dest).previa).toBe(a));
  it('deseleccionar vuelve a la región previa y la olvida', () => expect(planZoom('x', null, a, z, null)).toEqual({ previa: null, ir: a }));
  it('sin región previa no hay nada a donde volver; sin cambios no hace nada', () => {
    expect(planZoom('x', null, null, z, null).ir).toBeNull();
    expect(planZoom(null, null, null, z, null)).toEqual({ previa: null, ir: null });
  });
});
