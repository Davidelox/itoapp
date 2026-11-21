import type { Pertenencia, Sitio } from '@/lib/mapa/tipos';
import type { ElementoItinerario } from '@/lib/planificador/itinerario';
import { coleccionDelPlan, diasEnItinerario, planesParaItinerario, sitiosDelPlan, textoAnadidoPor, textoEnItinerario } from '@/lib/planificador/sitios';
import { sitioInicialVisible } from '@/lib/mapa/conexiones';

const PLAN = { id: 'p1', start_date: '2026-12-05', end_date: '2026-12-08' };

const sitio = (id: string, name: string, status: Sitio['status'] = 'want_to_go'): Sitio => ({
  id, name, address: null, lat: 0, lng: 0, category: 'restaurant', status, visible_to_partner: true,
  primary_collection_id: null, created_by: 'u1', version: 1, created_at: '2026-11-01T10:00:00Z', place_notes: [],
});
const el = (id: string, place_id: string | null, start_date: string, parcial: Partial<ElementoItinerario> = {}) =>
  ({ id, title: id, start_date, end_date: null, place_id, plan_id: 'p1', ...parcial }) as ElementoItinerario;
const pert = (collection_id: string, place_id: string, added_by: string | null = null): Pertenencia => ({ collection_id, place_id, added_at: '2026-11-02T10:00:00Z', added_by });

describe('coleccionDelPlan', () => {
  it('encuentra la colección por plan_id', () => {
    const cs = [{ id: 'c1', plan_id: null }, { id: 'c2', plan_id: 'p1' }];
    expect(coleccionDelPlan('p1', cs)?.id).toBe('c2');
    expect(coleccionDelPlan('p9', cs)).toBeNull();
  });
});

describe('diasEnItinerario', () => {
  it('días sin repetir y en orden', () => {
    const els = [el('a', 's1', '2026-12-07'), el('b', 's1', '2026-12-05'), el('c', 's1', '2026-12-07'), el('d', 's2', '2026-12-06')];
    expect(diasEnItinerario('s1', els, PLAN)).toEqual([1, 3]);
  });
  it('ignora lo de otro plan y lo que cae fuera de las fechas', () => {
    const els = [el('a', 's1', '2026-12-20'), el('b', 's1', '2026-12-06', { plan_id: 'p2' })];
    expect(diasEnItinerario('s1', els, PLAN)).toEqual([]);
  });
});

describe('sitiosDelPlan', () => {
  it('solo los de la colección, con quién los añadió y su día', () => {
    const sitios = [sitio('s1', 'A'), sitio('s2', 'B'), sitio('s3', 'C')];
    const perts = [pert('c1', 's1', 'u1'), pert('c1', 's2'), pert('c2', 's3', 'u2')];
    const r = sitiosDelPlan('c1', PLAN, sitios, perts, [el('a', 's2', '2026-12-06')]);
    expect(r.map((x) => x.sitio.id).sort()).toEqual(['s1', 's2']);
    expect(r.find((x) => x.sitio.id === 's1')).toMatchObject({ anadidoPor: 'u1', dias: [] });
    expect(r.find((x) => x.sitio.id === 's2')).toMatchObject({ anadidoPor: null, dias: [2] });
  });
  it('no enseña un sitio de la colección que esta persona no ve', () => {
    expect(sitiosDelPlan('c1', PLAN, [sitio('s1', 'A')], [pert('c1', 's1'), pert('c1', 'oculto')], [])).toHaveLength(1);
  });
});

describe('textoEnItinerario', () => {
  it('uno, varios y ninguno', () => {
    expect(textoEnItinerario([], 4)).toBeNull();
    expect(textoEnItinerario([2], 4)).toBe('En el itinerario · Día 2');
    expect(textoEnItinerario([1, 3], 4)).toBe('En el itinerario · Días 1 y 3');
    expect(textoEnItinerario([1, 2, 4], 4)).toBe('En el itinerario · Días 1, 2 y 4');
  });
  it('en un plan de un día no habla de días', () => {
    expect(textoEnItinerario([1], 1)).toBe('En el itinerario');
  });
});

describe('textoAnadidoPor', () => {
  it('tú, tu pareja o nadie', () => {
    expect(textoAnadidoPor('u1', 'u1', 'María')).toBe('Lo añadiste tú');
    expect(textoAnadidoPor('u2', 'u1', 'María')).toBe('Lo añadió María');
    expect(textoAnadidoPor(null, 'u1', 'María')).toBeNull();
  });
});

describe('planesParaItinerario', () => {
  it('ofrece en curso y próximos, nunca los pasados', () => {
    const planes = [
      { id: 'a', name: 'Pasado', start_date: '2026-11-01', end_date: '2026-11-03' },
      { id: 'b', name: 'En curso', start_date: '2026-11-20', end_date: '2026-11-23' },
      { id: 'c', name: 'Próximo', start_date: '2026-12-05', end_date: '2026-12-08' },
    ];
    expect(planesParaItinerario(planes, '2026-11-21').map((p) => p.id)).toEqual(['b', 'c']);
    expect(planesParaItinerario(planes, '2026-12-09')).toEqual([]);
  });
});

describe('sitioInicialVisible', () => {
  it('solo si el sitio está entre los que ves', () => {
    expect(sitioInicialVisible([{ id: 's1' }], 's1')).toBe('s1');
    expect(sitioInicialVisible([{ id: 's1' }], 's2')).toBeNull();
    expect(sitioInicialVisible(undefined, 's1')).toBeNull();
    expect(sitioInicialVisible([{ id: 's1' }], null)).toBeNull();
  });
});
