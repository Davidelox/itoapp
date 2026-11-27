import type { Paleta } from '@/constants/theme';
import type { Miembro, Pareja } from '@/lib/pareja/EstadoProvider';

/** Quién es quién en pantalla: nombre de la pareja (o «Tu pareja» si aún no se ha unido) y tintas de cada uno. */
export function personas(pareja: Pareja, colors: Paleta) {
  const otra: Miembro | null = pareja.otra;
  const nombrePareja = otra?.nombre.trim() || 'Tu pareja';
  return {
    yo: pareja.yo,
    otra,
    nombrePareja,
    tintaYo: pareja.yo.color ? colors.personas[pareja.yo.color].ink : colors.text,
    tintaPareja: otra?.color ? colors.personas[otra.color].ink : colors.text,
  };
}
