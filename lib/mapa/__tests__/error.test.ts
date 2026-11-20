import { ERROR_GENERICO, SIN_CONEXION, mensajeErrorMapa } from '@/lib/mapa/error';

describe('mensajeErrorMapa', () => {
  it('traduce los códigos del Mapa', () => {
    expect(mensajeErrorMapa({ code: 'TW053' })).toBe('Un sitio compartido no puede volver a ser privado.');
    expect(mensajeErrorMapa({ code: 'TW064' })).toBe('Ese sitio ya no está disponible.');
    expect(mensajeErrorMapa({ code: '23505' })).toBe('Ya está en vuestro mapa.');
    expect(mensajeErrorMapa({ code: 'TW013' })).toContain('Solo quien guardó');
    expect(mensajeErrorMapa({ code: 'TW060' })).toBe('Este sitio ya no existe.');
  });
  it('un código desconocido o ausente da el genérico, nunca error.message', () => {
    expect(mensajeErrorMapa({ code: 'XX999', message: 'secreto interno' })).toBe(ERROR_GENERICO);
    expect(mensajeErrorMapa(null)).toBe(ERROR_GENERICO);
  });
  it('un fallo de red avisa de la conexión', () => {
    expect(mensajeErrorMapa({ name: 'TypeError', message: 'Network request failed' })).toBe(SIN_CONEXION);
  });
});
