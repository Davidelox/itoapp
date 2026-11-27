import { claveFiltro } from '@/lib/calendario/agrupar';
import { paletas } from '@/constants/theme';
import { marcadorFiltro } from '@/lib/calendario/colores';
import { CATEGORIAS_FORMULARIO, INFO_CATEGORIA_EVENTO, infoCategoriaEvento } from '@/lib/calendario/evento';
import { OPCIONES_FILTRO, sugerenciaNuevo } from '@/lib/calendario/filtros';
import { categoriaGastoDe } from '@/lib/calendario/quienPago';
import { CATEGORIAS, INFO_CATEGORIA, infoCategoria } from '@/lib/gastos/categorias';
import { CATEGORIAS_RUTINARIAS, decidirAccion } from '@/lib/gastos/visitaAutomatica';

const NUEVAS = [
  ['sports', 'Deportivo', 'football'],
  ['home_night', 'Velada en casa', 'home'],
  ['culture', 'Cultura', 'film'],
  ['social', 'Quedada', 'people'],
  ['health', 'Salud', 'heart'],
] as const;

const colors = paletas.claro;

describe('categorías nuevas de evento', () => {
  it.each(NUEVAS)('%s: etiqueta, icono, formulario, filtro y sugerencia', (valor, etiqueta, icono) => {
    expect(INFO_CATEGORIA_EVENTO[valor].etiqueta).toBe(etiqueta);
    expect(CATEGORIAS_FORMULARIO.find((c) => c.valor === valor)?.etiqueta).toBe(etiqueta);
    const op = OPCIONES_FILTRO.find((o) => o.valor === valor);
    expect(op).toMatchObject({ etiqueta, icono });
    expect(marcadorFiltro(op!, false, colors).icono).toBe(icono);
    expect(claveFiltro({ tipo: 'event', categoria: valor, planId: null })).toBe(valor);
    expect(sugerenciaNuevo([valor])).toEqual({ categoria: valor });
  });

  it('una categoría desconocida cae en «Otros»', () => {
    expect(infoCategoriaEvento('inventada')).toBe(INFO_CATEGORIA_EVENTO.other);
    expect(claveFiltro({ tipo: 'event', categoria: 'inventada' as never, planId: null })).toBe('other');
  });

  it('el gasto de un evento deportivo o de salud', () => {
    expect(categoriaGastoDe('sports')).toBe('leisure');
    expect(categoriaGastoDe('health')).toBe('health');
  });
});

describe('categoría de gasto delivery', () => {
  it('tiene nombre, icono y es rutinaria', () => {
    expect(CATEGORIAS).toContain('delivery');
    expect(INFO_CATEGORIA.delivery).toEqual({ nombre: 'Comida a domicilio', icono: 'bag-handle-outline' });
    expect(CATEGORIAS_RUTINARIAS).toContain('delivery');
    expect(decidirAccion({ fecha: '2026-01-01', hoy: '2026-02-01', categoria: 'delivery', planId: null })).toBe('nada');
  });

  it('una desconocida cae en «Otros»', () => {
    expect(infoCategoria('inventada')).toBe(INFO_CATEGORIA.other);
  });
});
