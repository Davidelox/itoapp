import {
  chipsTarjeta,
  contadorTareas,
  errorNotaTarea,
  errorTitulo,
  etiquetaMarcar,
  etiquetaTarea,
  filaDeTarea,
  formularioDeTarea,
  formularioTareaNuevo,
  lineaTarea,
  ordenarTareas,
  pendientesDe,
  siguientePosicion,
  tareasPorPlan,
} from '@/lib/planificador/tareas';
import type { Tarea } from '@/lib/planificador/tipos';

const t = (o: Partial<Tarea> = {}): Tarea => ({
  id: 'a',
  plan_id: 'p1',
  kind: 'task',
  title: 'Comprar regalo',
  detail: null,
  assignee: null,
  status: 'pending',
  done_by: null,
  due_date: null,
  place_id: null,
  position: 0,
  version: 1,
  ...o,
});
const YO = { slot: 'm1' as const, userId: 'u-yo' };

describe('orden y contador', () => {
  it('pendientes primero (con fecha antes que sin ella), luego hechas por posición', () => {
    const r = ordenarTareas([
      t({ id: 'h2', status: 'done', position: 2 }),
      t({ id: 's', position: 0 }),
      t({ id: 'f2', due_date: '2026-12-10', position: 5 }),
      t({ id: 'h1', status: 'done', position: 1 }),
      t({ id: 'f1', due_date: '2026-12-01', position: 9 }),
      t({ id: 's2', position: 1 }),
    ]).map((x) => x.id);
    expect(r).toEqual(['f1', 'f2', 's', 's2', 'h1', 'h2']);
  });
  it('no cambia el original', () => {
    const a = [t({ id: 'x', status: 'done' }), t({ id: 'y' })];
    ordenarTareas(a);
    expect(a[0].id).toBe('x');
  });
  it('cuenta «1 de 3 hechas», «1 de 1 hecha» y nada sin tareas', () => {
    expect(contadorTareas([t(), t({ status: 'done' }), t()])).toBe('1 de 3 hechas');
    expect(contadorTareas([t({ status: 'done' })])).toBe('1 de 1 hecha');
    expect(contadorTareas([])).toBeNull();
    expect(pendientesDe([t(), t({ status: 'done' })])).toBe(1);
  });
  it('siguiente posición y agrupado por plan', () => {
    expect(siguientePosicion([])).toBe(0);
    expect(siguientePosicion([t({ position: 3 }), t({ position: 1 })])).toBe(4);
    const m = tareasPorPlan([t({ id: '1' }), t({ id: '2', plan_id: 'p2' }), t({ id: '3' })]);
    expect(m.get('p1')?.map((x) => x.id)).toEqual(['1', '3']);
    expect(m.get('p2')).toHaveLength(1);
  });
});

describe('formulario', () => {
  it('valida el título (1 a 120) y la nota (200)', () => {
    expect(errorTitulo('  ')).toMatch(/título/);
    expect(errorTitulo('a'.repeat(121))).toMatch(/120/);
    expect(errorTitulo('a'.repeat(120))).toBeNull();
    expect(errorNotaTarea('x'.repeat(201))).toMatch(/200/);
    expect(errorNotaTarea('')).toBeNull();
  });
  it('convierte entre formulario y fila según quién mira', () => {
    const f = { ...formularioTareaNuevo(), titulo: '  Cena ', tipo: 'booking' as const, asignada: 'pareja' as const, fecha: '2026-12-02', nota: ' ', sitio: 's1' };
    expect(filaDeTarea(f, 'm1')).toEqual({ kind: 'booking', title: 'Cena', detail: null, assignee: 'm2', due_date: '2026-12-02', place_id: 's1' });
    expect(filaDeTarea({ ...f, asignada: 'yo' }, 'm2').assignee).toBe('m2');
    expect(filaDeTarea({ ...f, asignada: null }, 'm1').assignee).toBeNull();
  });
  it('una tarea normal no guarda sitio', () => {
    expect(filaDeTarea({ ...formularioTareaNuevo(), titulo: 'x', sitio: 's1' }, 'm1').place_id).toBeNull();
  });
  it('rellena el formulario desde una tarea', () => {
    expect(formularioDeTarea(t({ assignee: 'm2', detail: 'n', kind: 'booking', place_id: 's' }), 'm1')).toMatchObject({ asignada: 'pareja', nota: 'n', tipo: 'booking', sitio: 's' });
    expect(formularioDeTarea(t({ assignee: 'm1' }), 'm1').asignada).toBe('yo');
  });
});

describe('textos', () => {
  it('pendiente: asignada a ti, a la pareja o sin asignar', () => {
    expect(lineaTarea(t({ assignee: 'm1' }), YO, 'María')).toMatchObject({ prefijo: 'Asignada · ', nombre: 'Tú', de: 'yo' });
    expect(lineaTarea(t({ assignee: 'm2', due_date: '2026-12-02' }), YO, 'María')).toMatchObject({ nombre: 'María', de: 'pareja', fecha: '2 dic' });
    expect(lineaTarea(t(), YO, 'María')).toMatchObject({ prefijo: 'Sin asignar', nombre: null });
  });
  it('hecha: por ti, por la pareja o sin saber quién; no enseña la fecha', () => {
    expect(lineaTarea(t({ status: 'done', done_by: 'u-yo', due_date: '2026-12-02' }), YO, 'María')).toEqual({ prefijo: 'Hecho por ', nombre: 'ti', de: 'yo', fecha: null });
    expect(lineaTarea(t({ status: 'done', done_by: 'otro' }), YO, 'María')).toMatchObject({ nombre: 'María', de: 'pareja' });
    expect(lineaTarea(t({ status: 'done' }), YO, 'María').prefijo).toBe('Hecha');
  });
  it('etiquetas accesibles', () => {
    expect(etiquetaTarea(t({ title: 'Reservar cena', kind: 'booking', assignee: 'm1' }), YO, 'María')).toBe('Reservar cena, reserva, asignada a ti, pendiente');
    expect(etiquetaTarea(t({ status: 'done', done_by: 'otro' }), YO, 'María')).toBe('Comprar regalo, hecha por María');
    expect(etiquetaMarcar(t())).toBe('Marcar como hecha: Comprar regalo');
    expect(etiquetaMarcar(t({ status: 'done' }))).toBe('Marcar como pendiente: Comprar regalo');
  });
});

describe('chips de la tarjeta', () => {
  it('hasta 2 hechas (+N) y la siguiente pendiente tuya', () => {
    const r = chipsTarjeta(
      [
        t({ id: '1', title: 'Regalo', status: 'done', position: 0 }),
        t({ id: '2', title: 'Tarta', status: 'done', position: 1 }),
        t({ id: '3', title: 'Globos', status: 'done', position: 2 }),
        t({ id: '4', title: 'De ella', assignee: 'm2', position: 3 }),
        t({ id: '5', title: 'Reservar cena', assignee: 'm1', position: 4, due_date: '2026-12-01' }),
        t({ id: '6', title: 'Más tarde', assignee: 'm1', position: 5 }),
      ],
      'm1',
    );
    expect(r).toEqual({ hechas: ['Regalo', 'Tarta'], masHechas: 1, siguiente: 'Reservar cena — Tú' });
  });
  it('sin tareas o sin ninguna tuya no hay chips', () => {
    expect(chipsTarjeta([], 'm1')).toEqual({ hechas: [], masHechas: 0, siguiente: null });
    expect(chipsTarjeta([t({ assignee: 'm2' })], 'm1').siguiente).toBeNull();
  });
});
