/** Alfabeto del servidor (generate_invite_code): sin I, L, O, 0 ni 1. */
const VALIDO = /[A-HJKMNP-Z2-9]/;

/** Misma normalización que join_couple: mayúsculas y solo alfanuméricos. */
export const normalizarCodigo = (texto: string) => texto.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Lo que se ve en el campo: `4K7·Q2X`. El separador es solo visual. */
export function formatearCodigo(texto: string): string {
  const limpio = normalizarCodigo(texto).slice(0, 6);
  return limpio.length > 3 ? `${limpio.slice(0, 3)}·${limpio.slice(3)}` : limpio;
}

/** ¿Tiene 6 caracteres del alfabeto del servidor? */
export const codigoCompleto = (texto: string) => {
  const limpio = normalizarCodigo(texto);
  return limpio.length === 6 && [...limpio].every((c) => VALIDO.test(c));
};
