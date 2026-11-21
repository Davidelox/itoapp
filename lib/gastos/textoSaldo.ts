/** Qué dice la tarjeta de saldo (get_balance): los cuatro casos, con el importe en positivo. */
export type TextoSaldo =
  | { tipo: 'sinPareja'; cents: 0 }
  | { tipo: 'teDebe' | 'debes'; cents: number }
  | { tipo: 'enPaz'; cents: 0 };

/** `neto` > 0: la pareja te debe; < 0: debes tú; 0 sin pareja unida: aún no hay a quién; 0 con pareja: en paz. */
export function textoSaldo(neto: number, hayPareja: boolean): TextoSaldo {
  if (!hayPareja && neto === 0) return { tipo: 'sinPareja', cents: 0 };
  if (neto > 0) return { tipo: 'teDebe', cents: neto };
  if (neto < 0) return { tipo: 'debes', cents: -neto };
  return { tipo: 'enPaz', cents: 0 };
}
