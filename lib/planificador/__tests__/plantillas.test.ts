import { MAX_SUGERIDAS, PLANTILLAS, alternarSugerida, elegidas, filasSugeridas } from '@/lib/planificador/plantillas';

describe('plantillas', () => {
  it('un viaje sugiere reservas, una celebración mezcla y «otro» ninguna', () => {
    expect(PLANTILLAS.trip.map((s) => s.titulo)).toEqual(['Vuelos', 'Alojamiento', 'Coche', 'Seguro de viaje', 'Actividades']);
    expect(PLANTILLAS.trip.every((s) => s.tipo === 'booking')).toBe(true);
    expect(PLANTILLAS.celebration.map((s) => s.tipo)).toEqual(['task', 'booking', 'task']);
    expect(PLANTILLAS.other).toEqual([]);
    expect(MAX_SUGERIDAS).toBe(5);
  });
  it('todas marcadas por defecto; se desmarca y se vuelve a marcar', () => {
    expect(elegidas('celebration', [])).toHaveLength(3);
    const d = alternarSugerida([], 'Regalo');
    expect(elegidas('celebration', d).map((s) => s.titulo)).toEqual(['Reserva', 'Invitaciones']);
    expect(alternarSugerida(d, 'Regalo')).toEqual([]);
    expect(elegidas('other', [])).toEqual([]);
  });
  it('genera filas con el id de su hueco y posiciones correlativas', () => {
    const f = filasSugeridas(elegidas('celebration', ['Regalo']), ['i1', 'i2', 'i3'], 4);
    expect(f).toEqual([
      { id: 'i1', position: 4, kind: 'booking', title: 'Reserva', detail: null, assignee: null, due_date: null, place_id: null },
      { id: 'i2', position: 5, kind: 'task', title: 'Invitaciones', detail: null, assignee: null, due_date: null, place_id: null },
    ]);
  });
});
