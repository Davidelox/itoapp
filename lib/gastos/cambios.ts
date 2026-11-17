/** Columnas que difieren de lo guardado: al editar solo se envía lo que alguien ha cambiado. */
export function soloCambios<G extends object, N extends object>(guardado: G, nuevo: N): Partial<N> {
  const cambios: Partial<N> = {};
  for (const clave of Object.keys(nuevo) as (keyof N)[]) {
    if (nuevo[clave] !== (guardado as Record<keyof N, unknown>)[clave]) cambios[clave] = nuevo[clave];
  }
  return cambios;
}
