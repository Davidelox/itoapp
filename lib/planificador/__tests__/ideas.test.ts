import { conTipoIdea, etiquetaIdea, filaDeIdea, formularioDeIdea, formularioIdeaNuevo, hayErroresIdea, iconoDeIdea, ordenarIdeas, textoIdea, validarIdea, type Idea } from '@/lib/planificador/ideas';
import { aplicarPrecarga, parametrosDeIdea, parametrosDePlan, precargaDeParametros } from '@/lib/planificador/precarga';
import { formularioNuevo } from '@/lib/planificador/plan';
import type { Plan } from '@/lib/planificador/tipos';

const UUID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
const idea = (o: Partial<Idea> = {}): Idea => ({ id: UUID, title: 'Auroras boreales', icon: '🏔️', type: 'trip', place_id: null, notes: null, created_by: null, version: 1, created_at: '2026-11-01T10:00:00Z', ...o });

describe('ideas', () => {
  it('ordena las más recientes primero y desempata por título', () => {
    const l = ordenarIdeas([idea({ id: 'a', title: 'B', created_at: '2026-01-01' }), idea({ id: 'b', title: 'A', created_at: '2026-03-01' }), idea({ id: 'c', title: 'A', created_at: '2026-01-01' })]);
    expect(l.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('texto «Viaje · sin fecha» y etiqueta accesible', () => {
    expect(textoIdea(idea())).toBe('Viaje · sin fecha');
    expect(textoIdea(idea({ type: 'celebration' }))).toBe('Celebración · sin fecha');
    expect(etiquetaIdea(idea({ notes: ' Con mantas ' }))).toBe('Auroras boreales, viaje, sin fecha, Con mantas');
  });

  it('valida título, icono y nota', () => {
    expect(hayErroresIdea(validarIdea({ ...formularioIdeaNuevo(), titulo: 'Roma' }))).toBe(false);
    expect(validarIdea({ ...formularioIdeaNuevo(), titulo: '  ' }).titulo).not.toBeNull();
    expect(validarIdea({ ...formularioIdeaNuevo(), titulo: 'x'.repeat(121) }).titulo).not.toBeNull();
    expect(validarIdea({ ...formularioIdeaNuevo(), titulo: 'Roma', icono: 'abc' }).icono).not.toBeNull();
    expect(validarIdea({ ...formularioIdeaNuevo(), titulo: 'Roma', nota: 'x'.repeat(2001) }).nota).not.toBeNull();
  });

  it('fila: recorta, nota vacía a null y conserva el sitio', () => {
    expect(filaDeIdea({ titulo: ' Roma ', tipo: 'trip', icono: '✈️', nota: '  ', sitio: UUID })).toEqual({ title: 'Roma', icon: '✈️', type: 'trip', place_id: UUID, notes: null });
  });

  it('el icono acompaña al tipo solo si no se había elegido otro', () => {
    expect(conTipoIdea(formularioIdeaNuevo(), 'celebration').icono).toBe('🎂');
    expect(conTipoIdea({ ...formularioIdeaNuevo(), icono: '🍷' }, 'celebration').icono).toBe('🍷');
  });

  it('una idea sin icono usa el del tipo', () => {
    expect(iconoDeIdea(idea({ icon: null, type: 'other' }))).toBe('⭐');
    expect(formularioDeIdea(idea({ icon: null, notes: 'n', place_id: UUID }))).toMatchObject({ icono: '✈️', nota: 'n', sitio: UUID });
  });
});

describe('convertir en plan', () => {
  it('los parámetros de una idea vuelven como precarga', () => {
    const pre = precargaDeParametros(parametrosDeIdea(idea({ notes: 'Con mantas', place_id: UUID })));
    expect(pre).toEqual({ idea: UUID, nombre: 'Auroras boreales', tipo: 'trip', icono: '🏔️', notas: 'Con mantas', sitio: UUID });
  });

  it('descarta lo inválido: ids que no son uuid, tipo raro, icono que no es emoji', () => {
    const pre = precargaDeParametros({ idea: 'x; drop', sitio: '1', tipo: 'hack', icono: 'texto', nombre: '  Roma  ', presupuesto: 'abc' });
    expect(pre).toEqual({ nombre: 'Roma' });
    expect(precargaDeParametros({})).toBeNull();
    expect(precargaDeParametros({ nombre: '   ' })).toBeNull();
  });

  it('recorta nombre largo y toma el primer valor de un array', () => {
    expect(precargaDeParametros({ nombre: 'x'.repeat(200) })?.nombre).toHaveLength(80);
    expect(precargaDeParametros({ tipo: ['other', 'trip'] })?.tipo).toBe('other');
  });

  it('aplica la precarga al formulario nuevo', () => {
    const base = formularioNuevo('2026-11-20');
    const f = aplicarPrecarga(base, { nombre: 'Cena', tipo: 'celebration', notas: 'n' });
    expect(f).toMatchObject({ nombre: 'Cena', tipo: 'celebration', icono: '🎂', notas: 'n', destino: '', fin: base.inicio });
    expect(aplicarPrecarga(base, null)).toBe(base);
    expect(aplicarPrecarga(base, { tipo: 'trip', destino: 'Roma', icono: '🍷' })).toMatchObject({ destino: 'Roma', icono: '🍷' });
  });
});

describe('duplicar plan', () => {
  const plan: Plan = {
    id: UUID, type: 'trip', name: 'Lisboa', icon: '✈️', destination: 'Portugal', start_date: '2026-09-01', end_date: '2026-09-04', budget_cents: 90050,
    default_split_mode: 'half', default_split_pct_m1: 50, notes: 'privado', created_by: null, version: 3,
  };

  it('lleva nombre, tipo, icono, destino y presupuesto; no fechas ni notas ni id de idea', () => {
    const pre = precargaDeParametros(parametrosDePlan(plan));
    expect(pre).toEqual({ nombre: 'Lisboa', tipo: 'trip', icono: '✈️', destino: 'Portugal', presupuesto: '900,50' });
    const f = aplicarPrecarga(formularioNuevo('2026-11-20'), pre);
    expect(f).toMatchObject({ inicio: '2026-11-20', notas: '', presupuesto: '900,50' });
  });

  it('sin presupuesto ni destino no los manda', () => {
    expect(parametrosDePlan({ ...plan, budget_cents: null, destination: null })).toEqual({ nombre: 'Lisboa', tipo: 'trip', icono: '✈️' });
  });
});
