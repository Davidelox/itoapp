import { colors, personColors } from '@/constants/theme';
import { colorBarra, contraste, marcador, marcadorFiltro, paletaDe } from '@/lib/calendario/colores';

const evento = { tipo: 'event' as const, categoria: 'other', asistentes: 'both' as const };

const { menta, lavanda, melocoton, malva } = personColors;

describe('marcador', () => {
  it('evento de una persona: insignia con su pastel de relleno y su tono oscuro de contorno e icono', () => {
    expect(marcador({ ...evento, asistentes: 'm1' }, 'menta', 'lavanda')).toEqual({
      forma: 'insignia',
      icono: 'calendar',
      relleno: menta.bg,
      borde: menta.ink,
      tinta: menta.ink,
    });
    expect(marcador({ ...evento, asistentes: 'm2' }, 'menta', 'lavanda')).toMatchObject({ relleno: lavanda.bg, borde: lavanda.ink });
  });
  it('el icono sale de la categoría: viaje, comer fuera, ocio y, por defecto, el calendario', () => {
    const icono = (categoria: string | null) => marcador({ ...evento, categoria, asistentes: 'm1' }, 'menta', null).icono;
    expect(icono('trip')).toBe('airplane');
    expect(icono('eating_out')).toBe('restaurant');
    expect(icono('leisure')).toBe('ticket');
    expect(icono('other')).toBe('calendar');
    expect(icono(null)).toBe('calendar');
  });
  it('evento de los dos: partido, m1 a la izquierda y m2 a la derecha, cada mitad con su pastel y su contorno', () => {
    expect(marcador(evento, 'menta', 'lavanda')).toEqual({
      forma: 'insignia',
      icono: 'calendar',
      relleno: menta.bg,
      borde: menta.ink,
      relleno2: lavanda.bg,
      borde2: lavanda.ink,
      tinta: colors.text,
    });
  });
  it('de los dos pero con el mismo color (o sin color): no se parte', () => {
    expect(marcador(evento, 'menta', 'menta').relleno2).toBeUndefined();
    expect(marcador(evento, null, null)).toMatchObject({ relleno: colors.eventChip, borde: colors.eventDot });
    expect(marcador(evento, null, null).relleno2).toBeUndefined();
  });
  it('persona sin color elegido: el azul de reserva en su mitad', () => {
    expect(marcador({ ...evento, asistentes: 'm2' }, 'menta', null)).toMatchObject({ relleno: colors.eventChip, borde: colors.eventDot });
    expect(marcador(evento, 'menta', null)).toMatchObject({ relleno2: colors.eventChip, borde2: colors.eventDot });
  });
  it('pago: cuadrado naranja con un icono blanco, sea de quien sea', () => {
    expect(marcador({ tipo: 'payment', categoria: null, asistentes: 'both' }, 'menta', 'lavanda')).toEqual({
      forma: 'pago',
      recurrente: true,
      relleno: colors.pagoMarca,
      borde: colors.pagoMarca,
      tinta: colors.white,
    });
  });
  it('pago único: solo monedas (no recurrente); mensual o anual: monedas con insignia de bucle (recurrente)', () => {
    const pago = (frecuencia: 'once' | 'monthly' | 'yearly' | null) =>
      marcador({ tipo: 'payment', categoria: null, asistentes: 'both', frecuencia }, 'menta', 'lavanda');
    expect(pago('once').recurrente).toBe(false);
    expect(pago('monthly').recurrente).toBe(true);
    expect(pago('yearly').recurrente).toBe(true);
    // Sin saber la frecuencia (recurrentes aún sin cargar) se pinta como recurrente, que es lo habitual.
    expect(pago(null).recurrente).toBe(true);
    // Un evento no lleva la marca.
    expect(marcador(evento, 'menta', 'lavanda').recurrente).toBeUndefined();
    // Los dos son del mismo naranja.
    expect(pago('once')).toMatchObject({ relleno: colors.pagoMarca, tinta: colors.white });
  });
  it('pago en solitario: cuadrado con el pastel de la persona, contorno y monedas en su tono oscuro', () => {
    const solo = (duenoSolo: 'm1' | 'm2' | null, m1: Parameters<typeof marcador>[1] = 'menta', m2: Parameters<typeof marcador>[2] = 'lavanda') =>
      marcador({ tipo: 'payment', categoria: null, asistentes: 'both', frecuencia: 'monthly', duenoSolo }, m1, m2);
    expect(solo('m1')).toEqual({ forma: 'pago', recurrente: true, relleno: menta.bg, borde: menta.ink, tinta: menta.ink });
    expect(solo('m2')).toEqual({ forma: 'pago', recurrente: true, relleno: lavanda.bg, borde: lavanda.ink, tinta: lavanda.ink });
    // Sin color de perfil: el azul de reserva.
    expect(solo('m1', null, null)).toMatchObject({ relleno: colors.eventChip, borde: colors.eventDot, tinta: colors.eventDot });
    expect(solo('m2', 'menta', null)).toMatchObject({ relleno: colors.eventChip, tinta: colors.eventDot });
    // Único en solitario: sigue sin bucle.
    expect(marcador({ tipo: 'payment', categoria: null, asistentes: 'both', frecuencia: 'once', duenoSolo: 'm1' }, 'menta', 'lavanda').recurrente).toBe(false);
    // Compartido (null) o sin el dato: naranja con monedas blancas.
    expect(solo(null)).toMatchObject({ relleno: colors.pagoMarca, borde: colors.pagoMarca, tinta: colors.white });
    expect(marcador({ tipo: 'payment', categoria: null, asistentes: 'both' }, 'menta', 'lavanda')).toMatchObject({ relleno: colors.pagoMarca });
    // Un evento ignora el dueño.
    expect(marcador({ ...evento, duenoSolo: 'm1' }, 'menta', 'lavanda').forma).toBe('insignia');
  });
  it('cumpleaños: regalo fucsia sobre la insignia pastel de la persona (partida si es de los dos)', () => {
    const cumple = { ...evento, categoria: 'birthday' };
    expect(marcador({ ...cumple, asistentes: 'm2' }, 'menta', 'lavanda')).toEqual({
      forma: 'insignia',
      icono: 'gift',
      relleno: lavanda.bg,
      borde: lavanda.ink,
      tinta: colors.cumpleMarca,
    });
    expect(marcador(cumple, 'menta', 'lavanda')).toMatchObject({
      icono: 'gift',
      relleno: menta.bg,
      relleno2: lavanda.bg,
      borde2: lavanda.ink,
      tinta: colors.cumpleMarca,
    });
  });
  it('un cumpleaños sigue siendo un regalo aunque la persona no tenga color', () => {
    expect(marcador({ ...evento, categoria: 'birthday', asistentes: 'm1' }, null, null)).toMatchObject({ icono: 'gift', relleno: colors.eventChip });
  });
});

describe('colorBarra', () => {
  it('una persona: su pastel y su contorno; los dos: dos juegos (m1 primero)', () => {
    expect(colorBarra({ ...evento, asistentes: 'm1' }, 'melocoton', 'malva')).toEqual({
      relleno: melocoton.bg,
      borde: melocoton.ink,
      relleno2: null,
      borde2: null,
    });
    expect(colorBarra(evento, 'melocoton', 'malva')).toEqual({
      relleno: melocoton.bg,
      borde: melocoton.ink,
      relleno2: malva.bg,
      borde2: malva.ink,
    });
  });
  it('los dos con el mismo color: una sola cinta; sin color: el azul de reserva', () => {
    expect(colorBarra(evento, 'malva', 'malva').relleno2).toBeNull();
    expect(colorBarra({ ...evento, asistentes: 'm1' }, null, null)).toMatchObject({ relleno: colors.eventChip, borde: colors.eventDot });
  });
});

describe('paletaDe', () => {
  it('el color elegido es el pastel (como en el avatar), con el tono oscuro de contorno; sin color, el azul de reserva', () => {
    expect(paletaDe('malva')).toEqual({ relleno: malva.bg, borde: malva.ink });
    expect(paletaDe(null)).toEqual({ relleno: colors.eventChip, borde: colors.eventDot });
  });
});

describe('marcadorFiltro (menú de filtros)', () => {
  it('Pagos dibuja las monedas (un pago único, sin bucle)', () => {
    expect(marcadorFiltro({ icono: 'pago' }, false)).toMatchObject({ forma: 'pago', recurrente: false });
  });
  it('el resto, una insignia con su icono («Otros» lleva el calendario)', () => {
    expect(marcadorFiltro({ icono: 'airplane' }, false)).toMatchObject({ forma: 'insignia', icono: 'airplane' });
    expect(marcadorFiltro({ icono: 'calendar' }, false)).toMatchObject({ forma: 'insignia', icono: 'calendar' });
  });
  it('sin elegir es neutro; elegido usa el granate de la marca', () => {
    expect(marcadorFiltro({ icono: 'gift' }, false)).toMatchObject({ relleno: colors.surface, borde: colors.icon, tinta: colors.icon });
    expect(marcadorFiltro({ icono: 'gift' }, true)).toMatchObject({ relleno: colors.accentSoft, borde: colors.accent, tinta: colors.accent });
    expect(marcadorFiltro({ icono: 'pago' }, true)).toMatchObject({ relleno: colors.accentSoft, borde: colors.accent, tinta: colors.accent });
  });
  it('el glifo se ve sobre su fondo, elegido o no (≥ 3:1)', () => {
    for (const activo of [false, true]) {
      const m = marcadorFiltro({ icono: 'calendar' }, activo);
      expect(contraste(m.tinta, m.relleno)).toBeGreaterThanOrEqual(3);
    }
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
  it('el contorno oscuro de cada color de perfil se ve sobre blanco, pero el pastel solo no basta', () => {
    for (const c of Object.values(personColors)) expect(contraste(c.bg, colors.white)).toBeLessThan(3);
  });
  it('el icono se ve sobre el pastel de cualquiera de los 6 colores y sobre el azul de reserva (≥ 3:1)', () => {
    const fondos = [...Object.values(personColors).map((c) => c.bg), colors.eventChip];
    // Tono oscuro de la persona sobre su propio pastel, y texto normal sobre cada pastel (insignia partida).
    for (const c of Object.values(personColors)) expect(contraste(c.ink, c.bg)).toBeGreaterThanOrEqual(3);
    expect(contraste(colors.eventDot, colors.eventChip)).toBeGreaterThanOrEqual(3);
    for (const f of fondos) expect(contraste(colors.text, f)).toBeGreaterThanOrEqual(3);
  });
  it('el regalo fucsia se ve sobre los 6 pasteles y sobre el azul de reserva (≥ 3:1)', () => {
    for (const f of [...Object.values(personColors).map((c) => c.bg), colors.eventChip]) {
      expect(contraste(colors.cumpleMarca, f)).toBeGreaterThanOrEqual(3);
    }
  });
  it('las monedas (y el bucle) del pago en solitario se ven sobre su pastel, con cualquier color de perfil (≥ 3:1)', () => {
    for (const color of [...Object.keys(personColors), null] as (keyof typeof personColors | null)[]) {
      const m = marcador({ tipo: 'payment', categoria: null, asistentes: 'both', frecuencia: 'monthly', duenoSolo: 'm1' }, color, null);
      expect(contraste(m.tinta, m.relleno)).toBeGreaterThanOrEqual(3);
      expect(contraste(m.borde, m.relleno)).toBeGreaterThanOrEqual(3);
    }
  });
  it('el icono blanco se ve sobre el naranja del pago (≥ 3:1)', () => {
    expect(contraste(colors.white, colors.pagoMarca)).toBeGreaterThanOrEqual(3);
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
  it('el número de los días de otros meses se lee sobre el blanco, el tinte de fin de semana y el gris de otros meses (≥ 4,5:1)', () => {
    expect(contraste(colors.diaAtenuado, colors.white)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(colors.diaAtenuado, colors.finde)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(colors.diaAtenuado, colors.fueraDeMes)).toBeGreaterThanOrEqual(4.5);
  });
  it('el texto normal y el secundario se leen sobre el gris de otros meses (≥ 4,5:1)', () => {
    expect(contraste(colors.text, colors.fueraDeMes)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(colors.textSecondary, colors.fueraDeMes)).toBeGreaterThanOrEqual(4.5);
  });
  it('los textos normales y secundarios se leen sobre el tinte de fin de semana (≥ 4,5:1)', () => {
    expect(contraste(colors.text, colors.finde)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(colors.textSecondary, colors.finde)).toBeGreaterThanOrEqual(4.5);
  });
});
