import { diaCorto, estaVacia, limpiarNota, miNota, normalizarValoracion, pasoValoracion, puedeValorar, textoEstadisticas, tocarEstrella } from '@/lib/mapa/valoracion';

describe('normalizarValoracion', () => {
  it('ajusta a medias estrellas dentro de 0,5–5', () => {
    expect(normalizarValoracion(3.8)).toBe(4);
    expect(normalizarValoracion(3.2)).toBe(3);
    expect(normalizarValoracion(0.1)).toBe(0.5);
    expect(normalizarValoracion(9)).toBe(5);
  });
  it('vacío, cero o inválido es sin valoración', () => {
    expect(normalizarValoracion(null)).toBeNull();
    expect(normalizarValoracion(0)).toBeNull();
    expect(normalizarValoracion(NaN)).toBeNull();
  });
});

describe('tocarEstrella', () => {
  it('entera → media → quitar', () => {
    expect(tocarEstrella(null, 3)).toBe(3);
    expect(tocarEstrella(3, 3)).toBe(2.5);
    expect(tocarEstrella(2.5, 3)).toBeNull();
    expect(tocarEstrella(1, 1)).toBe(0.5);
    expect(tocarEstrella(0.5, 1)).toBeNull();
    expect(tocarEstrella(2, 5)).toBe(5);
  });
});

describe('pasoValoracion', () => {
  it('sube y baja de 0,5 en 0,5 con topes', () => {
    expect(pasoValoracion(null, 0.5)).toBe(0.5);
    expect(pasoValoracion(4.5, 0.5)).toBe(5);
    expect(pasoValoracion(5, 0.5)).toBe(5);
    expect(pasoValoracion(0.5, -0.5)).toBeNull();
    expect(pasoValoracion(null, -0.5)).toBeNull();
  });
});

describe('limpiarNota y estaVacia', () => {
  it('recorta el texto y un texto en blanco es null', () => {
    expect(limpiarNota(4, '  Muy rico ')).toEqual({ rating: 4, note: 'Muy rico' });
    expect(limpiarNota(null, '   ')).toEqual({ rating: null, note: null });
  });
  it('corta a 1000 caracteres', () => {
    expect(limpiarNota(null, 'a'.repeat(1200)).note).toHaveLength(1000);
  });
  it('vacía solo si no hay ni valoración ni texto', () => {
    expect(estaVacia({ rating: null, note: null })).toBe(true);
    expect(estaVacia({ rating: 3, note: null })).toBe(false);
    expect(estaVacia({ rating: null, note: 'x' })).toBe(false);
  });
});

describe('miNota', () => {
  const notas = [{ user_id: 'a', rating: 3, note: null }];
  it('busca mi fila', () => {
    expect(miNota(notas, 'a')?.rating).toBe(3);
    expect(miNota(notas, 'b')).toBeUndefined();
    expect(miNota(notas, null)).toBeUndefined();
  });
});

describe('textoEstadisticas', () => {
  it('une las partes con datos', () => {
    const t = textoEstadisticas({ total_spent_cents: 14200, next_event_on: '2026-11-20' });
    expect(t).toContain('142');
    expect(t).toContain('Próximo plan: vie 20');
  });
  it('singular y partes ausentes', () => {
    expect(textoEstadisticas({ total_spent_cents: 0, next_event_on: '2026-11-20' })).toBe('Próximo plan: vie 20');
    expect(textoEstadisticas({ total_spent_cents: 0, next_event_on: null })).toBeNull();
    expect(textoEstadisticas(null)).toBeNull();
  });
  it('diaCorto', () => expect(diaCorto('2026-11-22')).toBe('dom 22'));
});

describe('puedeValorar', () => {
  it('solo en «Hemos ido»', () => {
    expect(puedeValorar('been')).toBe(true);
    expect(puedeValorar('want_to_go')).toBe(false);
  });
});
