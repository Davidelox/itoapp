import { aISO, ayerISO, deISO, fechaCorta, fechaLarga, fijarZonaHoraria, horaEnZona, hoyISO, nombreMes } from '@/lib/gastos/fechas';
import { formatearEuros, formatearImporte, leerEuros } from '@/lib/dinero/importe';

const ahora = new Date(2026, 10, 17, 10, 0); // martes 17 nov 2026

describe('fechas', () => {
  it('ida y vuelta sin desfase de zona horaria', () => {
    expect(aISO(deISO('2026-11-07'))).toBe('2026-11-07');
  });
  it('hoy, ayer y fecha corta', () => {
    expect(fechaCorta('2026-11-17', ahora)).toBe('Hoy');
    expect(fechaCorta('2026-11-16', ahora)).toBe('Ayer');
    expect(fechaCorta('2026-11-07', ahora)).toBe('Sáb 7 nov');
    expect(fechaCorta('2025-12-31', ahora)).toBe('Mié 31 dic 2025');
  });
  it('ayer al cambiar de mes', () => {
    expect(ayerISO(new Date(2026, 11, 1))).toBe('2026-11-30');
  });
  it('fecha larga y mes', () => {
    expect(fechaLarga('2026-11-07', ahora)).toBe('Sábado 7 nov');
    expect(nombreMes('2026-11-07')).toBe('Noviembre 2026');
  });
});

describe('horaEnZona', () => {
  afterEach(() => fijarZonaHoraria(null));
  it('hora de pared de la pareja, no la del dispositivo', () => {
    fijarZonaHoraria('Europe/Madrid');
    expect(horaEnZona('2026-11-20T22:00:00Z')).toBe('23:00');
    expect(horaEnZona(new Date('2026-07-20T22:30:00Z'))).toBe('00:30');
    fijarZonaHoraria('Atlantic/Canary');
    expect(horaEnZona('2026-11-20T22:00:00Z')).toBe('22:00');
  });
});

describe('importes', () => {
  it('leer lo que escribe la persona', () => {
    expect(leerEuros('62')).toBe(6200);
    expect(leerEuros('62,5')).toBe(6250);
    expect(leerEuros('1.000')).toBe(100000);
    expect(leerEuros('1.000,50')).toBe(100050);
    expect(leerEuros('12.50 €')).toBe(1250);
    expect(leerEuros('0')).toBeNull();
    expect(leerEuros('abc')).toBeNull();
    expect(leerEuros('1,234')).toBeNull();
  });
  it('formatear', () => {
    expect(formatearEuros(3100)).toBe('31 €'.replace(' ', ' '));
    expect(formatearEuros(12345)).toBe('123,45 €');
  });
});

describe('zona horaria de la pareja (M3)', () => {
  afterEach(() => fijarZonaHoraria(null));
  it('«hoy» es el día en la zona de la pareja, no la del móvil', () => {
    const instante = new Date(Date.UTC(2026, 10, 17, 23, 30)); // 00:30 del 18 en Madrid; 18:30 del 17 en Nueva York
    fijarZonaHoraria('Europe/Madrid');
    expect(hoyISO(instante)).toBe('2026-11-18');
    fijarZonaHoraria('America/New_York');
    expect(hoyISO(instante)).toBe('2026-11-17');
  });
  it('zona no válida: la del dispositivo', () => {
    fijarZonaHoraria('No/Existe');
    expect(hoyISO(ahora)).toBe(aISO(ahora));
  });
});
