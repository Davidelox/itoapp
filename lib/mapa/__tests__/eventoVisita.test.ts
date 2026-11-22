import { type EventoAuto, datosEventoVisita, decidirEventoAlCorregir, hayEventoEseDia, idEventoDeVisita, NOTA_EVENTO_VISITA } from '@/lib/mapa/eventoVisita';

const sitio = { id: 's1', name: ' Casa Lola ', category: 'restaurant' as const, visible_to_partner: true };

describe('idEventoDeVisita', () => {
  const id = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
  it('es determinista, válido y distinto del de la visita', () => {
    expect(idEventoDeVisita(id)).toBe(idEventoDeVisita(id));
    expect(idEventoDeVisita(id)).toBe('cf2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b');
    expect(idEventoDeVisita(id)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(idEventoDeVisita(idEventoDeVisita(id))).toBe(id);
  });
});

describe('hayEventoEseDia', () => {
  it('detecta un evento del día o que lo cubre', () => {
    expect(hayEventoEseDia([], '2026-11-10')).toBe(false);
    expect(hayEventoEseDia([{ start_date: '2026-11-10', end_date: null }], '2026-11-10')).toBe(true);
    expect(hayEventoEseDia([{ start_date: '2026-11-09', end_date: '2026-11-11' }], '2026-11-10')).toBe(true);
    expect(hayEventoEseDia([{ start_date: '2026-11-09', end_date: null }], '2026-11-10')).toBe(false);
    expect(hayEventoEseDia([{ start_date: '2026-11-08', end_date: '2026-11-09' }], '2026-11-10')).toBe(false);
  });
});

describe('datosEventoVisita', () => {
  it('sitio compartido: todo el día, de los dos, con la categoría del calendario y la nota', () => {
    const d = datosEventoVisita(sitio, '2020-01-05', 'm1');
    expect(d).toMatchObject({ title: 'Casa Lola', start_date: '2020-01-05', all_day: true, start_time: null, end_date: null, attendees: 'both', is_secret: false, category: 'eating_out', place_id: 's1', ask_who_paid: false, recurrence: 'none', notes: NOTA_EVENTO_VISITA });
  });
  it('sitio privado: secreto y solo de quien lo crea', () => {
    const d = datosEventoVisita({ ...sitio, visible_to_partner: false }, '2026-11-10', 'm2');
    expect(d).toMatchObject({ is_secret: true, attendees: 'm2' });
  });
  it('categorías y título largo', () => {
    expect(datosEventoVisita({ ...sitio, category: 'getaway' }, '2026-11-10', 'm1').category).toBe('trip');
    expect(datosEventoVisita({ ...sitio, category: 'other', name: 'x'.repeat(200) }, '2026-11-10', 'm1')).toMatchObject({ category: 'other', title: 'x'.repeat(120) });
  });
});

describe('decidirEventoAlCorregir', () => {
  const auto: EventoAuto = { version: 3, place_id: 's1', start_date: '2026-11-01', end_date: null, all_day: true, notes: 'Visita registrada' };
  const decidir = (a: EventoAuto | null, otros: { start_date: string; end_date: string | null }[] = [], nueva = '2026-11-05') =>
    decidirEventoAlCorregir(a, otros, 's1', '2026-11-01', nueva);

  it('mismo día: nada', () => expect(decidir(auto, [], '2026-11-01')).toEqual({ accion: 'nada' }));
  it('evento intacto: se mueve con su versión', () => expect(decidir(auto)).toEqual({ accion: 'mover', version: 3 }));
  it('editado a mano (nota, fecha o varios días): no se pisa', () => {
    expect(decidir({ ...auto, notes: 'Cena con amigos' })).toEqual({ accion: 'nada' });
    expect(decidir({ ...auto, start_date: '2026-11-02' })).toEqual({ accion: 'nada' });
    expect(decidir({ ...auto, end_date: '2026-11-03' })).toEqual({ accion: 'nada' });
  });
  it('ya hay otro evento del sitio el día nuevo: no duplica', () => {
    expect(decidir(auto, [{ start_date: '2026-11-04', end_date: '2026-11-06' }])).toEqual({ accion: 'nada' });
    expect(decidir(null, [{ start_date: '2026-11-05', end_date: null }])).toEqual({ accion: 'nada' });
  });
  it('sin evento automático y día libre: crea', () => expect(decidir(null)).toEqual({ accion: 'crear' }));
});
