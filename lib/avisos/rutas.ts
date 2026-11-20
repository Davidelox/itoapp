/**
 * Lista blanca de rutas a las que puede llevar un aviso (campo `url` del push). Un aviso que no encaje
 * (mal formado, de otra versión o manipulado) no navega: la app solo se abre.
 */
const ID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const PERMITIDAS = [
  /^\/$/,
  /^\/ajustes$/,
  new RegExp(`^/calendario/evento/${ID}(\\?fecha=\\d{4}-\\d{2}-\\d{2})?$`),
  new RegExp(`^/gastos/recurrente/${ID}$`),
  new RegExp(`^/gastos/pago/${ID}$`),
  new RegExp(`^/gastos/${ID}$`),
  new RegExp(`^/mapa/sitio/${ID}$`),
];

/** La ruta si está permitida; `null` si no. */
export function rutaPermitida(url: unknown): string | null {
  return typeof url === 'string' && url.length <= 200 && PERMITIDAS.some((r) => r.test(url)) ? url : null;
}
