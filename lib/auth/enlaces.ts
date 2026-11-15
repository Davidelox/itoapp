import * as Linking from 'expo-linking';

/**
 * URL a la que vuelve el enlace del email (`emailRedirectTo`):
 * web `http://localhost:8081/auth/callback`, Expo Go `exp://<IP>:8081/--/auth/callback`,
 * desarrollo o producción `ito://auth/callback`.
 */
export const urlCallback = (): string => Linking.createURL('auth/callback');
