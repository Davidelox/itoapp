import { ayudaBorradoPlanAjeno, ayudaBorradoPlanPendiente, textoBorrarPlan } from '@/lib/planificador/borrado';

describe('textos de pedir borrar un plan', () => {
  it('con pareja: pide aprobación, dice qué se borra y qué se conserva y la caducidad de 7 días', () => {
    const t = textoBorrarPlan(false, 'María');
    expect(t.titulo).toBe('¿Pedir borrar este plan?');
    expect(t.texto).toBe(
      'Se borrará el plan con sus tareas e itinerario; sus gastos y sitios se conservarán. María tendrá que aprobarlo. Si no responde en 7 días, el plan se queda.',
    );
    expect(t.boton).toBe('Enviar solicitud');
    expect(t.enlace).toBe('Pedir borrar este plan');
  });
  it('sin pareja: se borra al momento y no se puede deshacer', () => {
    const t = textoBorrarPlan(true, 'Tu pareja');
    expect(t.titulo).toBe('¿Borrar este plan?');
    expect(t.texto).toBe('Se borrará el plan con sus tareas e itinerario; sus gastos y sitios se conservarán. No se puede deshacer.');
    expect(t.boton).toBe('Borrar');
  });
  it('avisos de la banda y de la pareja', () => {
    expect(ayudaBorradoPlanPendiente('María')).toBe('El plan sigue igual hasta que María lo apruebe.');
    expect(ayudaBorradoPlanAjeno).toBe('Si no respondes en 7 días, el plan se queda.');
  });
});
