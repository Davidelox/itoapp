import type { Filtro } from '@/lib/calendario/agrupar';
import {
  OPCIONES_FILTRO,
  SEPARACION_MENU,
  alternarFiltro,
  etiquetaFiltro,
  posicionMenu,
  quitarFiltro,
  resumenFiltros,
  sugerenciaNuevo,
} from '@/lib/calendario/filtros';

const SEIS: Filtro[] = ['trip', 'eating_out', 'leisure', 'sports', 'home_night', 'culture', 'social', 'health', 'other', 'birthday', 'payment', 'plan'];
const MENU = { ancho: 224, alto: 320 };
const VENTANA = { width: 375, height: 812 };

describe('OPCIONES_FILTRO', () => {
  it('son las 12 opciones, en el orden del menú y sin repetir (sin «Todos» ni «Eventos»)', () => {
    expect(OPCIONES_FILTRO.map((o) => o.valor)).toEqual(SEIS);
    expect(new Set(OPCIONES_FILTRO.map((o) => o.valor)).size).toBe(12);
  });
  it('cada opción tiene etiqueta e icono', () => {
    for (const o of OPCIONES_FILTRO) {
      expect(o.etiqueta.length).toBeGreaterThan(0);
      expect(o.icono).toBeTruthy();
    }
    expect(OPCIONES_FILTRO.find((o) => o.valor === 'payment')?.icono).toBe('pago');
    expect(OPCIONES_FILTRO.find((o) => o.valor === 'other')?.icono).toBe('calendar');
  });
});

describe('etiquetaFiltro', () => {
  it('da el nombre de cada filtro', () => {
    expect(etiquetaFiltro('trip')).toBe('Viajes');
    expect(etiquetaFiltro('eating_out')).toBe('Comer fuera');
    expect(etiquetaFiltro('other')).toBe('Otros');
    expect(etiquetaFiltro('birthday')).toBe('Cumpleaños');
    expect(etiquetaFiltro('payment')).toBe('Pagos');
    expect(etiquetaFiltro('plan')).toBe('Planes');
  });
});

describe('alternarFiltro y quitarFiltro', () => {
  it('añade en el orden del menú, sea cual sea el orden en que se marque', () => {
    expect(alternarFiltro([], 'payment')).toEqual(['payment']);
    expect(alternarFiltro(['payment'], 'trip')).toEqual(['trip', 'payment']);
    expect(alternarFiltro(['payment', 'trip'], 'other')).toEqual(['trip', 'other', 'payment']);
  });
  it('quita si ya estaba; dos veces vuelve al principio', () => {
    expect(alternarFiltro(['trip', 'payment'], 'trip')).toEqual(['payment']);
    const antes: Filtro[] = ['leisure'];
    expect(alternarFiltro(alternarFiltro(antes, 'birthday'), 'birthday')).toEqual(antes);
  });
  it('marcar los 6 no se normaliza a vacío', () => {
    expect(SEIS.reduce<readonly Filtro[]>((acc, f) => alternarFiltro(acc, f), [])).toEqual(SEIS);
  });
  it('quitarFiltro quita uno; si no estaba, queda igual; no muta la entrada', () => {
    const f: readonly Filtro[] = ['trip', 'leisure'];
    expect(quitarFiltro(f, 'trip')).toEqual(['leisure']);
    expect(quitarFiltro(f, 'payment')).toEqual(['trip', 'leisure']);
    expect(f).toEqual(['trip', 'leisure']);
  });
});

describe('resumenFiltros', () => {
  it('sin filtros, uno, dos y tres', () => {
    expect(resumenFiltros([])).toBe('sin filtros');
    expect(resumenFiltros(['trip'])).toBe('Viajes');
    expect(resumenFiltros(['trip', 'leisure'])).toBe('Viajes y Ocio');
    expect(resumenFiltros(['trip', 'leisure', 'payment'])).toBe('Viajes, Ocio y Pagos');
  });
  it('sigue el orden del menú', () => {
    expect(resumenFiltros(['payment', 'trip'])).toBe('Viajes y Pagos');
  });
});

describe('sugerenciaNuevo', () => {
  it('con un solo filtro sugiere el tipo o la categoría', () => {
    expect(sugerenciaNuevo(['birthday'])).toEqual({ tipo: 'cumple' });
    expect(sugerenciaNuevo(['payment'])).toEqual({ tipo: 'pago' });
    expect(sugerenciaNuevo(['trip'])).toEqual({ categoria: 'trip' });
    expect(sugerenciaNuevo(['eating_out'])).toEqual({ categoria: 'eating_out' });
    expect(sugerenciaNuevo(['leisure'])).toEqual({ categoria: 'leisure' });
  });
  it('«Otros», ninguno o varios no sugieren nada', () => {
    expect(sugerenciaNuevo(['other'])).toEqual({});
    expect(sugerenciaNuevo([])).toEqual({});
    expect(sugerenciaNuevo(['trip', 'leisure'])).toEqual({});
  });
});

describe('posicionMenu', () => {
  const boton = { x: 319, y: 120, width: 36, height: 36 };
  it('debajo del botón y alineado a su borde derecho', () => {
    expect(posicionMenu(boton, VENTANA, MENU)).toEqual({ top: 120 + 36 + SEPARACION_MENU, left: 319 + 36 - 224 });
  });
  it('no se sale por la izquierda con un botón cerca del borde', () => {
    expect(posicionMenu({ x: 10, y: 120, width: 36, height: 36 }, VENTANA, MENU).left).toBe(8);
  });
  it('no se sale por la derecha', () => {
    expect(posicionMenu({ x: 360, y: 120, width: 36, height: 36 }, VENTANA, MENU).left).toBe(375 - 224 - 8);
  });
  it('se abre hacia arriba si abajo no cabe', () => {
    const { top } = posicionMenu({ x: 319, y: 700, width: 36, height: 36 }, VENTANA, MENU);
    expect(top).toBe(700 - SEPARACION_MENU - 320);
  });
  it('si no cabe ni arriba ni abajo, se queda dentro de la ventana', () => {
    const { top } = posicionMenu({ x: 319, y: 200, width: 36, height: 36 }, { width: 375, height: 400 }, MENU);
    expect(top).toBeGreaterThanOrEqual(8);
    expect(top + MENU.alto).toBeLessThanOrEqual(400 - 8);
  });
  it('una ventana más pequeña que el menú lo deja a `margen` del borde de arriba', () => {
    expect(posicionMenu(boton, { width: 375, height: 300 }, MENU).top).toBe(8);
    expect(posicionMenu(boton, { width: 375, height: 300 }, MENU, 12).top).toBe(12);
  });
  it('alineación al centro: centrado en el botón', () => {
    const b = { x: 150, y: 120, width: 80, height: 40 };
    expect(posicionMenu(b, VENTANA, { ancho: 296, alto: 312 }, 8, 'centro').left).toBe(150 + 40 - 148);
  });
  it('alineación al centro: no se sale por ningún borde', () => {
    const m = { ancho: 296, alto: 312 };
    expect(posicionMenu({ x: 0, y: 120, width: 60, height: 40 }, VENTANA, m, 8, 'centro').left).toBe(8);
    expect(posicionMenu({ x: 320, y: 120, width: 60, height: 40 }, VENTANA, m, 8, 'centro').left).toBe(375 - 296 - 8);
  });
});

describe('filtro «Planes»', () => {
  it('tiene el maletín, se marca con otros y no sugiere tipo para «Añadir evento»', () => {
    expect(OPCIONES_FILTRO.find((o) => o.valor === 'plan')?.icono).toBe('briefcase');
    expect(alternarFiltro(['payment'], 'plan')).toEqual(['payment', 'plan']);
    expect(quitarFiltro(['trip', 'plan'], 'plan')).toEqual(['trip']);
    expect(resumenFiltros(['trip', 'plan'])).toBe('Viajes y Planes');
    expect(sugerenciaNuevo(['plan'])).toEqual({});
  });
});
