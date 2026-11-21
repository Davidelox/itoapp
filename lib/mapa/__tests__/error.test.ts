import { ERROR_GENERICO, SIN_CONEXION, mensajeErrorMapa } from '@/lib/mapa/error';

describe('mensajeErrorMapa', () => {
  it('traduce los códigos del Mapa', () => {
    expect(mensajeErrorMapa({ code: 'TW053' })).toBe('Un sitio compartido no puede volver a ser privado.');
    expect(mensajeErrorMapa({ code: 'TW064' })).toBe('Ese sitio ya no está disponible.');
    expect(mensajeErrorMapa({ code: '23505' })).toBe('Ya está en vuestro mapa.');
    expect(mensajeErrorMapa({ code: 'TW013' })).toContain('Solo quien guardó');
    expect(mensajeErrorMapa({ code: 'TW060' })).toBe('Este sitio ya no existe.');
  });
  it('las colecciones tienen sus propios textos', () => {
    expect(mensajeErrorMapa({ code: 'TW061' }, true)).toBe('La colección de un plan se borra con el plan.');
    expect(mensajeErrorMapa({ code: 'TW060' }, true)).toBe('Esta colección ya no existe.');
    expect(mensajeErrorMapa({ code: 'TW013' }, true)).toContain('quien creó la colección');
    expect(mensajeErrorMapa({ code: 'TW053' }, true)).toBe('Un sitio compartido no puede volver a ser privado.');
    expect(mensajeErrorMapa({ code: 'TW054' }, true)).toBe('Una colección compartida no puede volver a ser privada.');
    expect(mensajeErrorMapa({ code: 'TW054' })).toBe(ERROR_GENERICO);
  });
  it('las visitas tienen sus propios textos', () => {
    expect(mensajeErrorMapa({ code: 'TW065' }, 'visita')).toBe('La fecha de la visita no puede ser futura.');
    expect(mensajeErrorMapa({ code: '23505' }, 'visita')).toBe('Ya teníais apuntada una visita ese día.');
    expect(mensajeErrorMapa({ code: '23514' }, 'visita')).toContain('200 caracteres');
    expect(mensajeErrorMapa({ code: 'TW064' }, 'visita')).toBe('Ese sitio ya no está disponible.');
    expect(mensajeErrorMapa({ code: 'TW065' })).toBe(ERROR_GENERICO);
    expect(mensajeErrorMapa({ code: '23505' }, 'coleccion')).toBe('Ya está en vuestro mapa.');
    expect(mensajeErrorMapa({ code: 'TW061' }, 'coleccion')).toBe('La colección de un plan se borra con el plan.');
  });
  it('un código desconocido o ausente da el genérico, nunca error.message', () => {
    expect(mensajeErrorMapa({ code: 'XX999', message: 'secreto interno' })).toBe(ERROR_GENERICO);
    expect(mensajeErrorMapa(null)).toBe(ERROR_GENERICO);
  });
  it('un fallo de red avisa de la conexión', () => {
    expect(mensajeErrorMapa({ name: 'TypeError', message: 'Network request failed' })).toBe(SIN_CONEXION);
  });
});
