import { estadoTrasPermiso, ofreceAjustes, textoAviso } from '../ubicacion';

describe('ubicación', () => {
  it('estado tras el permiso', () => {
    expect(estadoTrasPermiso(true)).toBe('buscando');
    expect(estadoTrasPermiso(false)).toBe('denegado');
  });
  it('avisos solo en los estados con problema', () => {
    expect(textoAviso('libre')).toBeNull();
    expect(textoAviso('buscando')).toBeNull();
    expect(textoAviso('denegado')).toMatch(/Ajustes/);
    expect(textoAviso('apagado')).toMatch(/apagado/);
    expect(textoAviso('error')).toMatch(/Inténtalo/);
  });
  it('Ajustes solo si denegado o apagado', () => {
    expect(ofreceAjustes('denegado')).toBe(true);
    expect(ofreceAjustes('apagado')).toBe(true);
    expect(ofreceAjustes('error')).toBe(false);
  });
});
