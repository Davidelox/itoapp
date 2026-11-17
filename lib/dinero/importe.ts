/** Importes en céntimos (enteros), como en la base de datos. Nunca float para guardar. */

const enteros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const decimales = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

/** 100000 → «1000 €»; 12345 → «123,45 €». Sin decimales si son cero. */
export function formatearEuros(cents: number): string {
  return cents % 100 === 0 ? enteros.format(cents / 100) : decimales.format(cents / 100);
}

/**
 * Lee lo que escribe la persona: «1000», «1.000», «1.000,50», «12,5», «12.50 €».
 * Devuelve céntimos, o null si no es un importe positivo de hasta 1 000 000 €.
 */
export function leerEuros(texto: string): number | null {
  let s = texto.replace(/[€\s]/g, '');
  if (s === '') return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return cents > 0 && cents <= 100_000_000 ? cents : null;
}

/** Importes de gastos y saldos: siempre con dos decimales («31,00 €», «1.234,50 €»). */
export const formatearImporte = (cents: number): string => decimales.format(cents / 100);
