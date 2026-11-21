/** Cierre de la cascada de sugerencias al elegir: lógica pura, sin React. */

/** ¿El texto es el mismo que dejó una selección (y no algo que haya escrito la persona)? Entonces no reabre la cascada. */
export const esEcoDeSeleccion = (
  texto: string,
  textoElegido: string | null,
): boolean => textoElegido !== null && texto === textoElegido;
