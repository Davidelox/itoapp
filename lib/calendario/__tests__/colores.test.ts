import { colors, personColors } from '@/constants/theme';
import { colorBarra, contraste, marcador, tintaDe } from '@/lib/calendario/colores';

const evento = { tipo: 'event' as const, categoria: 'other', asistentes: 'both' as const };

describe('marcador', () => {
  it('evento de una persona: círculo con el tono oscuro de su color', () => {
    expect(marcador({ ...evento, asistentes: 'm1' }, 'menta', 'lavanda')).toEqual({ forma: 'circulo', relleno: personColors.menta.ink });
    expect(marcador({ ...evento, asistentes: 'm2' }, 'menta', 'lavanda')).toEqual({ forma: 'circulo', relleno: personColors.lavanda.ink });
  });
  it('evento de los dos: partido, m1 a la izquierda y m2 a la derecha', () => {
    expect(marcador(evento, 'menta', 'lavanda')).toEqual({
      forma: 'mitades',
      relleno: personColors.menta.ink,
      relleno2: personColors.lavanda.ink,
    });
  });
  it('de los dos pero con el mismo color (o sin color): no se parte', () => {
    expect(marcador(evento, 'menta', 'menta').forma).toBe('circulo');
    expect(marcador(evento, null, null)).toEqual({ forma: 'circulo', relleno: colors.eventDot });
  });
  it('persona sin color elegido: el azul de reserva en su mitad', () => {
    expect(marcador({ ...evento, asistentes: 'm2' }, 'menta', null)).toEqual({ forma: 'circulo', relleno: colors.eventDot });
    expect(marcador(evento, 'menta', null)).toMatchObject({ forma: 'mitades', relleno2: colors.eventDot });
  });
  it('pago: cuadrado naranja, sea de quien sea', () => {
    expect(marcador({ tipo: 'payment', categoria: null, asistentes: 'both' }, 'menta', 'lavanda')).toEqual({
      forma: 'cuadrado',
      relleno: colors.pagoMarca,
    });
  });
  it('cumpleaños: relleno fucsia con anillo del color de la persona', () => {
    const cumple = { ...evento, categoria: 'birthday' };
    expect(marcador({ ...cumple, asistentes: 'm2' }, 'menta', 'lavanda')).toEqual({
      forma: 'anillo',
      relleno: colors.cumpleMarca,
      anillo: personColors.lavanda.ink,
    });
    // De los dos: anillo mitad y mitad.
    expect(marcador(cumple, 'menta', 'lavanda')).toEqual({
      forma: 'anillo',
      relleno: colors.cumpleMarca,
      anillo: personColors.menta.ink,
      anillo2: personColors.lavanda.ink,
    });
  });
  it('un cumpleaños se distingue por la forma aunque el anillo sea del color de reserva', () => {
    expect(marcador({ ...evento, categoria: 'birthday', asistentes: 'm1' }, null, null).forma).toBe('anillo');
  });
});

describe('colorBarra', () => {
  it('una persona: un color; los dos: dos colores (m1 primero)', () => {
    expect(colorBarra({ ...evento, asistentes: 'm1' }, 'menta', 'lavanda')).toEqual({ color: personColors.menta.ink, color2: null });
    expect(colorBarra(evento, 'menta', 'lavanda')).toEqual({ color: personColors.menta.ink, color2: personColors.lavanda.ink });
  });
});

describe('tintaDe', () => {
  it('sin color: el azul de reserva', () => {
    expect(tintaDe(null)).toBe(colors.eventDot);
    expect(tintaDe('malva')).toBe(personColors.malva.ink);
  });
});

describe('contraste (WCAG)', () => {
  it('la cuenta es correcta en los extremos', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contraste('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
  it('el tono oscuro de los 6 colores de perfil se ve sobre blanco (≥ 3:1, marca gráfica)', () => {
    for (const c of Object.values(personColors)) expect(contraste(c.ink, colors.white)).toBeGreaterThanOrEqual(3);
  });
  it('el azul de reserva, el naranja de los pagos y el fucsia de los cumpleaños también', () => {
    expect(contraste(colors.eventDot, colors.white)).toBeGreaterThanOrEqual(3);
    expect(contraste(colors.pagoMarca, colors.white)).toBeGreaterThanOrEqual(3);
    expect(contraste(colors.cumpleMarca, colors.white)).toBeGreaterThanOrEqual(3);
  });
  it('los textos de los chips se leen sobre su fondo (≥ 4,5:1)', () => {
    expect(contraste(colors.pagoChipTexto, colors.pagoChip)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(colors.cumpleChipTexto, colors.cumpleChip)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(colors.eventChipText, colors.eventChip)).toBeGreaterThanOrEqual(4.5);
  });
});
