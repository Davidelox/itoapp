import { type FilaRango, aElementos } from '@/lib/calendario/agrupar';
import { carrilesUsados, segmentosSemana } from '@/lib/calendario/carriles';
import { semanaDe } from '@/lib/calendario/rejilla';

const viaje = (id: string, desde: string, hasta: string, extra: Partial<FilaRango> = {}): FilaRango => ({
  kind: 'event',
  source_id: id,
  occurs_on: desde,
  ends_on: hasta,
  title: id,
  start_time: null,
  all_day: true,
  category: 'trip',
  ...extra,
});

// Semana del lunes 9 al domingo 15 de noviembre de 2026, y la siguiente (16–22).
const S1 = semanaDe('2026-11-09');
const S2 = semanaDe('2026-11-16');

describe('segmentosSemana', () => {
  const roma = aElementos([viaje('Roma', '2026-11-12', '2026-11-17')]);

  it('un viaje de jueves a martes se parte en 2 segmentos, uno por semana', () => {
    const a = segmentosSemana(S1, roma, 2).segmentos;
    expect(a).toHaveLength(1);
    // jueves a domingo: empieza aquí y sigue en la semana siguiente.
    expect(a[0]).toMatchObject({ colInicio: 3, colFin: 6, carril: 0, empieza: true, termina: false });
    const b = segmentosSemana(S2, roma, 2).segmentos;
    // lunes a martes: viene de la anterior y acaba aquí.
    expect(b[0]).toMatchObject({ colInicio: 0, colFin: 1, carril: 0, empieza: false, termina: true });
  });

  it('un viaje que empieza antes de la rejilla se dibuja desde la columna 0 y no «empieza»', () => {
    const largo = aElementos([viaje('Japón', '2026-10-28', '2026-11-11')]);
    const [s] = segmentosSemana(S1, largo, 2).segmentos;
    expect(s).toMatchObject({ colInicio: 0, colFin: 2, empieza: false, termina: true });
  });

  it('los eventos de un solo día y los que no tocan la semana no llevan barra', () => {
    const l = aElementos([viaje('Cena', '2026-11-12', '2026-11-12'), viaje('Otra', '2026-11-20', '2026-11-22')]);
    const r = segmentosSemana(S1, l, 2);
    expect(r.segmentos).toEqual([]);
    expect(r.ocultos).toEqual([]);
  });

  it('dos que se solapan van en carriles distintos; el que viene después de que acabe uno reutiliza su carril', () => {
    const l = aElementos([
      viaje('A', '2026-11-09', '2026-11-11'),
      viaje('B', '2026-11-10', '2026-11-12'),
      viaje('C', '2026-11-12', '2026-11-14'),
    ]);
    const { segmentos } = segmentosSemana(S1, l, 2);
    const carril = Object.fromEntries(segmentos.map((s) => [s.elemento.origenId, s.carril]));
    expect(carril).toEqual({ A: 0, B: 1, C: 0 });
    expect(carrilesUsados(segmentos)).toBe(2);
  });

  it('3 viajes solapados en el Mes (2 carriles): el tercero no se dibuja y cuenta en el «+» de sus días', () => {
    const l = aElementos([
      viaje('A', '2026-11-09', '2026-11-15'),
      viaje('B', '2026-11-09', '2026-11-15'),
      viaje('C', '2026-11-11', '2026-11-12'),
    ]);
    const r = segmentosSemana(S1, l, 2);
    expect(r.segmentos.map((s) => s.elemento.origenId).sort()).toEqual(['A', 'B']);
    expect(r.ocultos.map((s) => s.elemento.origenId)).toEqual(['C']);
    expect(r.ocultosPorDia).toEqual({ '2026-11-11': 1, '2026-11-12': 1 });
  });

  it('con 3 carriles (la Semana) caben los tres; el cuarto ya no', () => {
    const l = aElementos(['A', 'B', 'C', 'D'].map((n) => viaje(n, '2026-11-10', '2026-11-13')));
    const r = segmentosSemana(S1, l, 3);
    expect(r.segmentos).toHaveLength(3);
    expect(r.ocultos).toHaveLength(1);
    expect(new Set(r.segmentos.map((s) => s.carril))).toEqual(new Set([0, 1, 2]));
  });

  it('orden: empieza antes, más largo primero y luego el título', () => {
    const l = aElementos([
      viaje('Zeta', '2026-11-09', '2026-11-10'),
      viaje('Larga', '2026-11-09', '2026-11-13'),
      viaje('Alfa', '2026-11-09', '2026-11-10'),
    ]);
    const { segmentos } = segmentosSemana(S1, l, 3);
    expect(segmentos.sort((a, b) => a.carril - b.carril).map((s) => s.elemento.origenId)).toEqual(['Larga', 'Alfa', 'Zeta']);
  });

  it('el carril se calcula por semana: una barra puede cambiar de carril de una fila a otra', () => {
    const l = aElementos([viaje('Corto', '2026-11-09', '2026-11-12'), viaje('Largo', '2026-11-10', '2026-11-18')]);
    const s1 = segmentosSemana(S1, l, 2).segmentos;
    const s2 = segmentosSemana(S2, l, 2).segmentos;
    expect(s1.find((s) => s.elemento.origenId === 'Largo')?.carril).toBe(1);
    expect(s2.find((s) => s.elemento.origenId === 'Largo')?.carril).toBe(0);
  });

  it('sin carriles disponibles (0) todo queda oculto', () => {
    const r = segmentosSemana(S1, aElementos([viaje('A', '2026-11-09', '2026-11-10')]), 0);
    expect(r.segmentos).toEqual([]);
    expect(r.ocultos).toHaveLength(1);
  });

  it('carrilesUsados', () => {
    expect(carrilesUsados([])).toBe(0);
    expect(carrilesUsados([{ carril: 0 }, { carril: 2 }])).toBe(3);
  });
});
