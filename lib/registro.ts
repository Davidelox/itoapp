/**
 * Registro seguro de errores. En desarrollo escribe solo { contexto, code, status, name };
 * en producción no escribe nada. Nunca se registra `message` ni `details`: los de PostgREST
 * pueden incluir valores (por ejemplo «Key (couple_id, color)=(…)»).
 * Es el único archivo de app/ y lib/ que puede usar `console` (ver eslint.config.js).
 */
export function registrarError(contexto: string, error: unknown): void {
  if (!__DEV__) return;
  const e = (typeof error === 'object' && error !== null ? error : {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? v : undefined);
  console.warn('[ito]', { contexto, code: texto(e.code), status: texto(e.status), name: texto(e.name) });
}
