import type { Pertenencia, Sitio } from '@/lib/mapa/tipos';
import type { ElementoItinerario } from '@/lib/planificador/itinerario';
import { etiquetaPasado, itinerarioResumido, mesYAnio, pasados, puestoPor, sitiosVisitados, textoGastado } from '@/lib/planificador/resumen';

const HOY = '2026-11-20';
const p = (name: string, start_date: string, end_date: string) => ({ name, start_date, end_date });

describe('pasados', () => {
  it('solo los terminados (fin < hoy), el que acabó más tarde primero', () => {
    const l = pasados([p('curso', '2026-11-18', '2026-11-22'), p('hoy', '2026-11-20', '2026-11-20'), p('viejo', '2026-01-02', '2026-01-04'), p('ayer', '2026-11-19', '2026-11-19'), p('sept', '2026-09-01', '2026-09-10')], HOY);
    expect(l.map((x) => x.name)).toEqual(['ayer', 'sept', 'viejo']);
  });

  it('un plan que termina hoy sigue en Próximos y no en Pasados', () => {
    expect(pasados([p('hoy', '2026-11-18', '2026-11-20')], HOY)).toEqual([]);
  });

  it('desempata por inicio y por nombre', () => {
    const l = pasados([p('B', '2026-05-01', '2026-05-03'), p('A', '2026-05-01', '2026-05-03'), p('C', '2026-05-02', '2026-05-03')], HOY);
    expect(l.map((x) => x.name)).toEqual(['C', 'A', 'B']);
  });
});

describe('textos', () => {
  it('mes y año del fin', () => {
    expect(mesYAnio('2026-09-04')).toBe('Septiembre 2026');
  });

  it('«Gastado», sin gastos y desconocido', () => {
    expect(textoGastado(64000)!.replace(/\s/g, ' ')).toBe('Gastado 640 €');
    expect(textoGastado(0)).toBe('Sin gastos');
    expect(textoGastado(null)).toBeNull();
  });

  it('etiqueta accesible', () => {
    expect(etiquetaPasado({ name: 'Lisboa', type: 'trip', end_date: '2026-09-04', gastado_cents: 64000 }).replace(/\s/g, ' ')).toBe('Lisboa, viaje, terminó en septiembre 2026, gastado 640 €');
    expect(etiquetaPasado({ name: 'Cena', type: 'celebration', end_date: '2026-09-04', gastado_cents: null })).toBe('Cena, celebración, terminó en septiembre 2026');
  });
});

describe('puestoPor', () => {
  it('suma por quien pagó, sin tocar repartos', () => {
    expect(
      puestoPor(
        [
          { amount_cents: 10000, paid_by: 'm1' },
          { amount_cents: 2500, paid_by: 'm2' },
          { amount_cents: 500, paid_by: 'pot' },
          { amount_cents: 1000, paid_by: 'm1' },
        ],
        'm1',
      ),
    ).toEqual({ yo: 11000, pareja: 2500, bote: 500 });
    expect(puestoPor([{ amount_cents: 700, paid_by: 'm1' }], 'm2')).toEqual({ yo: 0, pareja: 700, bote: 0 });
    expect(puestoPor([], 'm1')).toEqual({ yo: 0, pareja: 0, bote: 0 });
  });
});

describe('sitiosVisitados', () => {
  const sitio = (id: string, status: Sitio['status']) => ({ id, name: id, status, category: 'other', created_at: '2026-01-01', place_notes: [] }) as unknown as Sitio;
  const pert = (collection_id: string, place_id: string) => ({ collection_id, place_id, added_at: '2026-01-01' }) as Pertenencia;

  it('solo los de la colección del plan en «Hemos ido»', () => {
    const r = sitiosVisitados('c1', [sitio('a', 'been'), sitio('b', 'want_to_go'), sitio('c', 'been')], [pert('c1', 'a'), pert('c1', 'b'), pert('c2', 'c')]);
    expect(r.map((s) => s.id)).toEqual(['a']);
  });

  it('sin colección no hay sitios', () => {
    expect(sitiosVisitados(null, [sitio('a', 'been')], [pert('c1', 'a')])).toEqual([]);
  });
});

describe('itinerarioResumido', () => {
  const el = (title: string, start_date: string, position = 0) =>
    ({ id: title, title, start_date, end_date: null, start_time: null, all_day: true, time_slot: null, position, plan_id: 'p' }) as unknown as ElementoItinerario;

  it('un renglón por día con algo, hasta tres títulos y «y N más»', () => {
    const r = itinerarioResumido([el('A', '2026-09-01'), el('B', '2026-09-01', 1), el('C', '2026-09-01', 2), el('D', '2026-09-01', 3), el('E', '2026-09-03')], '2026-09-01', '2026-09-03');
    expect(r.lineas).toHaveLength(2);
    expect(r.lineas[0].detalle).toBe('A, B, C y 1 más');
    expect(r.lineas[1]).toMatchObject({ fecha: '2026-09-03', detalle: 'E' });
    expect(r.fuera).toBe(0);
  });

  it('cuenta lo que quedó fuera de las fechas', () => {
    expect(itinerarioResumido([el('X', '2026-10-01')], '2026-09-01', '2026-09-03')).toEqual({ lineas: [], fuera: 1 });
  });
});
