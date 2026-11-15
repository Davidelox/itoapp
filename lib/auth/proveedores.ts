import type { Resultado } from '@/lib/auth/errores';

export type ProveedorSocial = 'apple' | 'google';

/**
 * Proveedores de acceso social disponibles. Vacío por ahora: Bienvenida pinta un botón por cada uno,
 * así que añadir uno aquí lo muestra. Recomendación para después: token nativo con `signInWithIdToken`
 * (expo-apple-authentication y @react-native-google-signin/google-signin).
 */
export const PROVEEDORES_SOCIALES: ProveedorSocial[] = [];

export const ETIQUETA_PROVEEDOR: Record<ProveedorSocial, string> = {
  apple: 'Continuar con Apple',
  google: 'Continuar con Google',
};

export async function entrarConProveedor(_proveedor: ProveedorSocial): Promise<Resultado> {
  return { ok: false, mensaje: 'Este método de acceso aún no está disponible.' };
}
