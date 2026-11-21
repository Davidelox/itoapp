/** Textos de pedir borrar un plan (docs/modelo-datos.md §6, mockup DetalleProyecto). Puro, sin red. */

/** Lo que se conserva y lo que se va (`execute_deletion`): el plan, sus tareas y su itinerario se borran; gastos y sitios (y su colección) se quedan. */
const QUE_PASA = 'Se borrará el plan con sus tareas e itinerario; sus gastos y sitios se conservarán.';

/**
 * Hoja de confirmación. `alMomento`: no hay pareja a quien pedírselo (el servidor decide igual). Con pareja, la hoja avisa
 * de que tendrá que aprobarlo y de que, si no responde en 7 días, el plan se queda.
 */
export function textoBorrarPlan(alMomento: boolean, nombrePareja: string) {
  return alMomento
    ? { titulo: '¿Borrar este plan?', texto: `${QUE_PASA} No se puede deshacer.`, boton: 'Borrar', enlace: 'Borrar este plan' }
    : {
        titulo: '¿Pedir borrar este plan?',
        texto: `${QUE_PASA} ${nombrePareja} tendrá que aprobarlo. Si no responde en 7 días, el plan se queda.`,
        boton: 'Enviar solicitud',
        enlace: 'Pedir borrar este plan',
      };
}

/** Banda de quien lo pidió: el plan sigue editable y sigue en el calendario y el mapa mientras tanto. */
export const ayudaBorradoPlanPendiente = (nombrePareja: string) => `El plan sigue igual hasta que ${nombrePareja} lo apruebe.`;

/** Aviso de la pareja en Inicio y en el plan. */
export const ayudaBorradoPlanAjeno = 'Si no respondes en 7 días, el plan se queda.';
