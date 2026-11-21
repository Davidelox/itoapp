import { traducir } from '@/lib/gastos/consultas';

// jest los sube antes del import: consultas.ts no crea el cliente de Supabase en la prueba.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/registro', () => ({ registrarError: jest.fn() }));

describe('traducir (errores de gastos)', () => {
  it('TW066: un gasto de un plan no puede ser privado', () => {
    const e = traducir('gastos.crear', { code: 'TW066', message: 'interno' });
    expect(e.message).toBe('Un gasto de un plan lo veis los dos: no puede ser privado.');
    expect(e.codigo).toBe('TW066');
  });
  it('TW067: un elemento del itinerario fuera de las fechas del plan', () => {
    const e = traducir('calendario.crearEvento', { code: 'TW067', message: 'interno' });
    expect(e.message).toBe('Ese día está fuera de las fechas del plan. Elige uno del plan.');
    expect(e.codigo).toBe('TW067');
  });
  it('TW069: un evento no cambia de plan', () => {
    const e = traducir('calendario.editarEvento', { code: 'TW069', message: 'interno' });
    expect(e.message).toBe('Un evento no puede cambiar de plan. Bórralo y créalo en el otro plan.');
    expect(e.codigo).toBe('TW069');
  });
  it('un código desconocido da el genérico, nunca error.message', () => {
    expect(traducir('gastos.crear', { code: 'XX999', message: 'secreto' }).message).toBe(
      'No se ha podido guardar. Inténtalo de nuevo.',
    );
  });
});
