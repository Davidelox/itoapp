import { AVISOS, aPreferencias, estadoPermisoDe, puedeRecibirPushDe, textoEstadoPermiso } from '@/lib/avisos/estado';
import { rutaPermitida } from '@/lib/avisos/rutas';

const ID = '0b6f1c2e-7a3d-4c1e-9f55-1234567890ab';

describe('rutaPermitida', () => {
  it.each([
    '/',
    '/ajustes',
    `/calendario/evento/${ID}`,
    `/calendario/evento/${ID}?fecha=2026-11-24`,
    `/gastos/${ID}`,
    `/gastos/pago/${ID}`,
    `/gastos/recurrente/${ID}`,
    `/mapa/sitio/${ID}`,
  ])('admite %s', (url) => expect(rutaPermitida(url)).toBe(url));

  it.each([
    undefined,
    null,
    42,
    '',
    'https://malo.com',
    '//malo.com',
    '/gastos/nuevo',
    '/gastos/../ajustes',
    `/gastos/${ID}/extra`,
    `/calendario/evento/${ID}?fecha=ayer`,
    `/calendario/evento/${ID}?x=1`,
    '/mapa/sitio/1',
    'ito://gastos/' + ID,
  ])('rechaza %p', (url) => expect(rutaPermitida(url)).toBeNull());
});

describe('estadoPermisoDe', () => {
  it('traduce el estado del sistema', () => {
    expect(estadoPermisoDe('granted')).toBe('concedido');
    expect(estadoPermisoDe('undetermined')).toBe('pendiente');
    expect(estadoPermisoDe('denied', false)).toBe('denegado');
    expect(estadoPermisoDe('denied', true)).toBe('pendiente');
    expect(estadoPermisoDe(undefined)).toBe('no_disponible');
  });
});

describe('puedeRecibirPushDe y textos', () => {
  it('solo en la app instalada y en un dispositivo real', () => {
    expect(puedeRecibirPushDe({ web: false, expoGo: false, dispositivoReal: true })).toBe(true);
    expect(puedeRecibirPushDe({ web: false, expoGo: true, dispositivoReal: true })).toBe(false);
    expect(puedeRecibirPushDe({ web: true, expoGo: false, dispositivoReal: true })).toBe(false);
    expect(puedeRecibirPushDe({ web: false, expoGo: false, dispositivoReal: false })).toBe(false);
  });
  it('explica Expo Go', () => {
    expect(textoEstadoPermiso('no_disponible', true)).toContain('Expo Go');
    expect(textoEstadoPermiso('concedido', false)).toContain('Activados');
  });
});

describe('aPreferencias', () => {
  it('lee las seis columnas y lo que falta cuenta como activado', () => {
    expect(AVISOS).toHaveLength(6);
    const p = aPreferencias({ notify_events: false, notify_requests: true });
    expect(p.notify_events).toBe(false);
    expect(p.notify_requests).toBe(true);
    expect(p.notify_settlements).toBe(true);
    expect(Object.values(aPreferencias(null)).every(Boolean)).toBe(true);
  });
});
