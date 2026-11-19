import { DESPLAZAMIENTO_SALIDA, decidirDeslizamiento } from '@/lib/calendario/deslizar';

const ANCHO = 375;

describe('decidirDeslizamiento', () => {
  it('un arrastre corto y lento no cambia de periodo', () => {
    expect(decidirDeslizamiento(-40, -50, ANCHO)).toBe(0);
    expect(decidirDeslizamiento(40, 50, ANCHO)).toBe(0);
    expect(decidirDeslizamiento(0, 0, ANCHO)).toBe(0);
  });
  it('arrastrar a la izquierda lo bastante pasa al siguiente; a la derecha, al anterior', () => {
    expect(decidirDeslizamiento(-90, -100, ANCHO)).toBe(1);
    expect(decidirDeslizamiento(90, 100, ANCHO)).toBe(-1);
  });
  it('el umbral de distancia es 80 px (en un ancho grande)', () => {
    expect(decidirDeslizamiento(-79, 0, ANCHO)).toBe(0);
    expect(decidirDeslizamiento(-80, 0, ANCHO)).toBe(1);
  });
  it('un fling corto pero rápido cambia', () => {
    expect(decidirDeslizamiento(-30, -800, ANCHO)).toBe(1);
    expect(decidirDeslizamiento(30, 800, ANCHO)).toBe(-1);
  });
  it('un fling de menos de 24 px no cambia', () => {
    expect(decidirDeslizamiento(-20, -2000, ANCHO)).toBe(0);
  });
  it('una velocidad justo bajo 500 px/s no cuenta como fling', () => {
    expect(decidirDeslizamiento(-40, -499, ANCHO)).toBe(0);
    expect(decidirDeslizamiento(-40, -500, ANCHO)).toBe(1);
  });
  it('si al soltar se vuelve atrás (velocidad contraria al arrastre), no cambia', () => {
    expect(decidirDeslizamiento(-120, 600, ANCHO)).toBe(0);
    expect(decidirDeslizamiento(120, -600, ANCHO)).toBe(0);
  });
  it('una velocidad contraria mínima (ruido del dedo) no anula un arrastre largo', () => {
    expect(decidirDeslizamiento(-120, 30, ANCHO)).toBe(1);
  });
  it('en un ancho estrecho el umbral es el 22 % del ancho', () => {
    // 200 px de ancho: umbral 44 px.
    expect(decidirDeslizamiento(-43, 0, 200)).toBe(0);
    expect(decidirDeslizamiento(-44, 0, 200)).toBe(1);
  });
  it('el desplazamiento de salida es de 56 px', () => {
    expect(DESPLAZAMIENTO_SALIDA).toBe(56);
  });
});
