import { paletas } from '@/constants/theme';
import { contraste } from '@/lib/calendario/colores';

/** Cada par texto/fondo de las dos paletas pasa WCAG AA (docs/plan-modo-oscuro.md §2). */
describe.each(['claro', 'oscuro'] as const)('paleta %s', (nombre) => {
  const c = paletas[nombre];
  const superficies = [c.background, c.card, c.surface, c.segmented];

  it('texto, secundario y error se leen sobre las superficies (≥ 4,5:1)', () => {
    for (const f of superficies) {
      expect(contraste(c.text, f)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(c.textSecondary, f)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(c.error, f)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(c.accent, f)).toBeGreaterThanOrEqual(4.5);
    }
  });
  // La paleta clara es la de siempre (sus bordes y marcas ya eran decorativos); estas dos comprobaciones valen para la oscura.
  const soloOscuro = nombre === 'oscuro' ? it : it.skip;
  soloOscuro('los iconos y los bordes de campo se ven (≥ 3:1)', () => {
    for (const f of [c.background, c.card]) {
      expect(contraste(c.icon, f)).toBeGreaterThanOrEqual(3);
      expect(contraste(c.inputBorder, f)).toBeGreaterThanOrEqual(3);
    }
  });
  it('el texto de los botones se lee sobre el acento y el acento sobre lo seleccionado (≥ 4,5:1)', () => {
    expect(contraste(c.onAccent, c.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(c.onAccent, c.accentDark)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(c.accent, c.accentSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(c.onAccent, c.text)).toBeGreaterThanOrEqual(4.5);
  });
  it('la tinta sobre las marcas de pago y cumpleaños se ve (≥ 3:1)', () => {
    expect(contraste(c.onMarca, c.pagoMarca)).toBeGreaterThanOrEqual(3);
    expect(contraste(c.onMarca, c.cumpleMarca)).toBeGreaterThanOrEqual(3);
  });
  it('los días de otros meses y los textos del calendario se leen sobre su fondo (≥ 4,5:1)', () => {
    for (const f of [c.card, c.background, c.finde, c.fueraDeMes]) expect(contraste(c.diaAtenuado, f)).toBeGreaterThanOrEqual(4.5);
    for (const f of [c.finde, c.fueraDeMes]) {
      expect(contraste(c.text, f)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(c.textSecondary, f)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('los chips de evento, pago y cumpleaños se leen (≥ 4,5:1)', () => {
    expect(contraste(c.eventChipText, c.eventChip)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(c.paymentChipText, c.paymentChip)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(c.pagoChipTexto, c.pagoChip)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(c.cumpleChipTexto, c.cumpleChip)).toBeGreaterThanOrEqual(4.5);
  });
  soloOscuro('las marcas gráficas se ven sobre el fondo (≥ 3:1)', () => {
    for (const f of [c.background, c.card]) {
      for (const m of [c.eventDot, c.paymentDot, c.pagoMarca, c.cumpleMarca]) expect(contraste(m, f)).toBeGreaterThanOrEqual(3);
    }
  });
  it('el nombre de cada color de persona (tinta) se lee sobre su relleno y sobre la tarjeta (≥ 4,5:1)', () => {
    for (const p of Object.values(c.personas)) {
      expect(contraste(p.ink, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(p.ink, c.card)).toBeGreaterThanOrEqual(nombre === 'oscuro' ? 4.5 : 3);
    }
  });
  it('las dos paletas tienen las mismas claves', () => {
    expect(Object.keys(paletas.oscuro).sort()).toEqual(Object.keys(paletas.claro).sort());
  });
});

describe('paleta oscura', () => {
  it('el texto se distingue del acento pastel', () => {
    expect(paletas.oscuro.text).not.toBe(paletas.oscuro.accent);
  });
});
