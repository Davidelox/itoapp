/** Error con un mensaje ya listo para mostrar y, si lo hay, el código del servidor (TW0xx, 23505…). */
export class ErrorGasto extends Error {
  constructor(
    mensaje: string,
    readonly codigo?: string,
  ) {
    super(mensaje);
  }
}
