import { puntosOndaCarga } from '@/components/hilo/ondaCarga';
import { etiquetaCabecera, mostrarNombres, recortarNombre } from '@/lib/inicio/hiloPareja';

describe('recortarNombre', () => {
  it('deja intactos los nombres cortos y limpia espacios', () => {
    expect(recortarNombre('Meri')).toBe('Meri');
    expect(recortarNombre('  Ana   María ')).toBe('Ana María');
    expect(recortarNombre('')).toBe('');
  });
  it('recorta los largos con elipsis sin pasar del máximo', () => {
    const r = recortarNombre('Maximiliano José');
    expect(r.endsWith('…')).toBe(true);
    expect(r.length).toBeLessThanOrEqual(9);
  });
});

describe('mostrarNombres', () => {
  it('los quita con letra grande o pantalla estrecha', () => {
    expect(mostrarNombres(375, 1)).toBe(true);
    expect(mostrarNombres(375, 1.5)).toBe(false);
    expect(mostrarNombres(320, 1)).toBe(false);
  });
});

describe('etiquetaCabecera', () => {
  it('nombra a los dos o avisa de que falta la pareja', () => {
    expect(etiquetaCabecera('David', 'Meri')).toBe('Ajustes y pareja: David y Meri');
    expect(etiquetaCabecera('David', null)).toContain('aún no se ha unido');
    expect(etiquetaCabecera(' ', null)).toContain('tú');
  });
});

describe('onda del hilo de pareja (reutiliza ondaCarga)', () => {
  it('es suave: extremos quietos a media altura y amplitud acotada', () => {
    const { xs, ys } = puntosOndaCarga(28, 10, 1.5, 1.2, 13);
    expect(xs).toHaveLength(13);
    expect(ys[0]).toBeCloseTo(5);
    expect(ys[12]).toBeCloseTo(5);
    for (const y of ys) expect(Math.abs(y - 5)).toBeLessThanOrEqual(3.5 + 1e-9);
  });
});
