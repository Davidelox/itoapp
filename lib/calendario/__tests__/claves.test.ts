import { claveRaizCalendario, opcionesInvalidarCalendario } from '@/lib/calendario/claves';

describe('claves del calendario', () => {
  it('la raíz es el prefijo de rangos, detalle y listas', () => {
    expect(claveRaizCalendario('c1')).toEqual(['calendario', 'c1']);
    expect(claveRaizCalendario(undefined)).toEqual(['calendario', 'ninguna']);
  });
  it('invalidar recarga también lo que no está montado', () => {
    expect(opcionesInvalidarCalendario('c1')).toEqual({ queryKey: ['calendario', 'c1'], refetchType: 'all' });
  });
});
