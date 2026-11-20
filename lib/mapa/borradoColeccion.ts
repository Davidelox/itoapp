/** Borrar una colección: qué pasará (texto de la hoja) y qué ha pasado (docs/plan-mapa.md §10). Puro, sin red. */

/** Lo que dice `preview_collection_deletion` (orientativo: la decisión final es la de `request_deletion`). */
export type PrevisionBorrado = 'delete' | 'leave' | 'approval' | 'plan';

export const esPrevision = (v: unknown): v is PrevisionBorrado => v === 'delete' || v === 'leave' || v === 'approval' || v === 'plan';

/** Resultado de `request_deletion` ya interpretado. `borrado`: ya no existe para ti (borrada o dejada). */
export type ResultadoBorrado = { borrado: boolean; dejada?: boolean; requestId?: string };

/** `null` si el estado no es el de una solicitud viva (cancelled / rejected / expired). */
export function resultadoBorrado(data: unknown): ResultadoBorrado | null {
  const d = (data ?? {}) as { status?: string; kept_by_partner?: boolean; request_id?: string };
  const requestId = d.request_id ? { requestId: d.request_id } : {};
  if (d.status === 'deleted' || d.status === 'approved') return { borrado: true, ...(d.kept_by_partner ? { dejada: true } : {}), ...requestId };
  if (d.status === 'pending') return { borrado: false, ...requestId };
  return null;
}

/** Título, texto y botón de la hoja. `prevision` null = aún no se sabe (o falló): texto genérico seguro. */
export function textoHojaBorrarColeccion(
  prevision: PrevisionBorrado | null,
  nombre: string,
  pareja: string,
): { titulo: string; texto: string; boton: string | null } {
  switch (prevision) {
    case 'delete':
      return { titulo: `¿Borrar «${nombre}»?`, texto: 'Los sitios se quedan en el mapa. No se puede deshacer.', boton: 'Borrar' };
    case 'leave':
      return {
        titulo: `¿Quitar «${nombre}» de tu vista?`,
        texto: `Desaparece de tu mapa y ${pareja} la conserva como suya, y podrá volver a compartirla. Los sitios no se borran.`,
        boton: 'Quitar',
      };
    case 'approval':
      return {
        titulo: `¿Pedir borrar «${nombre}»?`,
        texto: `${pareja} tendrá que aprobarlo porque añadió sitios a esta colección. Si no responde en 7 días, se queda. Los sitios no se borran.`,
        boton: 'Enviar solicitud',
      };
    case 'plan':
      return { titulo: `«${nombre}» es de un plan`, texto: 'Se borra con el plan: aquí no se puede borrar.', boton: null };
    default:
      return {
        titulo: `¿Borrar «${nombre}»?`,
        texto: `Los sitios no se borran. Si ${pareja} añadió sitios, tendrá que aprobarlo.`,
        boton: 'Borrar',
      };
  }
}

/** Aviso breve tras pedir borrar. */
export function avisoBorradoColeccion(r: ResultadoBorrado, pareja: string): string {
  if (!r.borrado) return `Solicitud enviada a ${pareja}`;
  return r.dejada ? `Has dejado la colección: ${pareja} la conserva` : 'Colección borrada';
}
