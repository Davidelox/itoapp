import { mensajeErrorPlan } from '@/lib/planificador/error';

describe('mensajeErrorPlan', () => {
  it('traduce los códigos conocidos', () => {
    expect(mensajeErrorPlan({ code: 'TW012' })).toMatch(/bote/);
    expect(mensajeErrorPlan({ code: '23514' })).toMatch(/60 días/);
    expect(mensajeErrorPlan({ code: 'TW060' })).toMatch(/ya no existe/);
    expect(mensajeErrorPlan({ code: 'TW064' })).toMatch(/sitio/);
  });

  it('traduce los errores del itinerario y de mover el plan (F6)', () => {
    expect(mensajeErrorPlan({ code: 'TW067' })).toBe('Ese día está fuera de las fechas del plan. Elige uno del plan.');
    expect(mensajeErrorPlan({ code: 'TW068' })).toBe(
      'Tu pareja ha cambiado el plan mientras tanto. Revisa las fechas y vuelve a guardar.',
    );
    expect(mensajeErrorPlan({ code: 'TW069' })).toBe('Un evento no puede cambiar de plan. Bórralo y créalo en el otro plan.');
  });

  it('un código desconocido o un mensaje técnico dan el genérico, nunca error.message', () => {
    const e = mensajeErrorPlan({ code: 'XX999', message: 'duplicate key value violates constraint' });
    expect(e).toBe('No se ha podido guardar. Inténtalo de nuevo.');
    expect(mensajeErrorPlan(new Error('boom'))).toBe('No se ha podido guardar. Inténtalo de nuevo.');
  });
});
