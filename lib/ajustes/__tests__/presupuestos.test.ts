import { leerPresupuestos } from '@/lib/ajustes/presupuestos';
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));


describe('leerPresupuestos', () => {
  it('solo «1» lo activa; por defecto, apagado', () => {
    expect(leerPresupuestos('1')).toBe(true);
    expect(leerPresupuestos('0')).toBe(false);
    expect(leerPresupuestos(null)).toBe(false);
    expect(leerPresupuestos(undefined)).toBe(false);
  });
});
