import {
  type Elemento,
  type FilaRango,
  type Filtros,
  type InfoPago,
  agruparPorDia,
  aElementos,
  claveFiltro,
  construirLista as construir,
  etiquetaAccesible,
  etiquetaDia,
  filtrar,
  claveBorrado,
  infoPagos,
  lineaElemento,
  ordenar,
  pendienteDeBorrar,
  puntosDelDia,
  resumenDia,
} from '@/lib/calendario/agrupar';
import { rangoCorto } from '@/lib/calendario/rejilla';

const fila = (extra: Partial<FilaRango>): FilaRango => ({
  kind: 'event',
  source_id: 'e1',
  occurs_on: '2026-11-17',
  title: 'Cena',
  start_time: null,
  all_day: true,
  ...extra,
});

const ctx = { yo: 'm1' as const, nombrePareja: 'Meri' };
/** Las listas de estas pruebas siempre existen (la Semana sin día seleccionado devuelve null: se prueba aparte). */
const construirLista = (p: Parameters<typeof construir>[0]) => construir(p)!;
// Intl separa el importe del € con un espacio duro.
const texto = (s: string) => s.replace(/\u00a0/g, ' ');

describe('aElementos', () => {
  it('descarta los planes y recorta la hora', () => {
    const l = aElementos([fila({ kind: 'plan', source_id: 'p1' }), fila({ start_time: '21:30:00' })]);
    expect(l).toHaveLength(1);
    expect(l[0].hora).toBe('21:30');
    expect(l[0].todoElDia).toBe(false);
  });
  it('tolera un servidor sin migrar: sin recurrence, attendees, is_secret ni occurrence_id', () => {
    const [e] = aElementos([fila({ kind: 'payment', status: 'paid', amount_cents: 1299 })]);
    expect(e).toMatchObject({ tipo: 'payment', estado: 'paid', repeticion: 'none', asistentes: 'both', secreto: false, cobroId: null });
  });
  it('lee las columnas nuevas', () => {
    const [e] = aElementos([fila({ recurrence: 'yearly', attendees: 'm2', is_secret: true, occurrence_id: null })]);
    expect(e).toMatchObject({ repeticion: 'yearly', asistentes: 'm2', secreto: true });
  });
  it('una repetición tiene una clave por fecha', () => {
    const l = aElementos([fila({ occurs_on: '2026-11-17' }), fila({ occurs_on: '2026-11-24' })]);
    expect(new Set(l.map((e) => e.clave)).size).toBe(2);
  });
});

describe('orden (igual que el servidor)', () => {
  it('fecha, luego todo el día antes que con hora, luego hora y título', () => {
    const l = aElementos([
      fila({ source_id: 'a', title: 'Cine', start_time: '19:00:00' }),
      fila({ source_id: 'b', title: 'Zarzuela', start_time: null }),
      fila({ source_id: 'c', title: 'Alquiler', start_time: null }),
      fila({ source_id: 'd', title: 'Cena', start_time: '21:30:00' }),
      fila({ source_id: 'e', title: 'Antes', occurs_on: '2026-11-16', start_time: '23:00:00' }),
    ]);
    expect(l.map((e) => e.titulo)).toEqual(['Antes', 'Alquiler', 'Zarzuela', 'Cine', 'Cena']);
    expect(ordenar([...l].reverse()).map((e) => e.titulo)).toEqual(l.map((e) => e.titulo));
  });
});

describe('día, filtros y puntos', () => {
  const l = aElementos([
    fila({ source_id: 'a', title: 'Cena', start_time: '21:00:00' }),
    fila({ kind: 'payment', source_id: 'p', title: 'Luz', status: 'scheduled' }),
    fila({ source_id: 'c', title: 'Sorpresa', occurs_on: '2026-11-18', is_secret: true }),
  ]);
  it('agrupa por día y filtra por tipo', () => {
    expect(Object.keys(agruparPorDia(l))).toEqual(['2026-11-17', '2026-11-18']);
    expect(filtrar(l, ['payment']).map((e) => e.titulo)).toEqual(['Luz']);
    expect(filtrar(l, ['other'])).toHaveLength(2);
    expect(filtrar(l, [])).toHaveLength(3);
  });
  it('glifos: máximo 4 y el resto en «+N»; candado si hay un secreto', () => {
    const dia = agruparPorDia(l);
    const d17 = puntosDelDia(dia['2026-11-17']);
    expect(d17.puntos.map((e) => e.tipo)).toEqual(['payment', 'event']);
    expect(d17).toMatchObject({ restantes: 0, secreto: false });
    expect(puntosDelDia(dia['2026-11-18']).secreto).toBe(true);
    const con = (n: number) => aElementos(Array.from({ length: n }, (_, i) => fila({ source_id: String(i) })));
    // 1, 2, 3 y 4 se ven enteros (con 4 no hay «+N»); con 5 o más se ven 4 y el resto va al «+N».
    for (const n of [1, 2, 3, 4]) {
      const p = puntosDelDia(con(n));
      expect(p.puntos).toHaveLength(n);
      expect(p.restantes).toBe(0);
    }
    const p5 = puntosDelDia(con(5));
    expect(p5.puntos).toHaveLength(4);
    expect(p5).toMatchObject({ restantes: 1, secreto: false });
    expect(puntosDelDia(con(9))).toMatchObject({ restantes: 5 });
    expect(puntosDelDia([])).toEqual({ puntos: [], restantes: 0, secreto: false, cumples: 0 });
  });
  it('los cumpleaños no son glifos: ni se dibujan ni cuentan en el «+N», solo en `cumples` (el regalo de la esquina)', () => {
    const cumple = (id: string) => fila({ source_id: id, category: 'birthday', title: id });
    const eventos = (n: number) => Array.from({ length: n }, (_, i) => fila({ source_id: `e${i}` }));
    // Solo cumpleaños: el centro queda vacío.
    expect(puntosDelDia(aElementos([cumple('a')]))).toEqual({ puntos: [], restantes: 0, secreto: false, cumples: 1 });
    // Dos cumpleaños: `cumples` = 2 (el «+» del regalo); siguen sin ser glifos.
    expect(puntosDelDia(aElementos([cumple('a'), cumple('b')]))).toMatchObject({ puntos: [], restantes: 0, cumples: 2 });
    // Con 4 eventos y 3 cumpleaños se ven los 4 eventos y no hay «+N».
    const mezcla = puntosDelDia(aElementos([...eventos(4), cumple('a'), cumple('b'), cumple('c')]));
    expect(mezcla.puntos).toHaveLength(4);
    expect(mezcla.puntos.every((e) => e.categoria !== 'birthday')).toBe(true);
    expect(mezcla).toMatchObject({ restantes: 0, cumples: 3 });
    // Con 5 eventos y un cumpleaños, el «+N» es 1: el cumpleaños no suma.
    expect(puntosDelDia(aElementos([...eventos(5), cumple('a')]))).toMatchObject({ restantes: 1, cumples: 1 });
    // Los pagos sí son glifos.
    expect(puntosDelDia(aElementos([fila({ kind: 'payment', source_id: 'p' }), cumple('a')])).puntos.map((e) => e.tipo)).toEqual(['payment']);
  });
  it('un cumpleaños secreto cuenta para el regalo y para el candado', () => {
    const [c] = aElementos([fila({ category: 'birthday', is_secret: true })]);
    expect(puntosDelDia([c])).toMatchObject({ puntos: [], cumples: 1, secreto: true });
  });
  it('las barras ocultas suman al «+N»', () => {
    const con = (n: number) => aElementos(Array.from({ length: n }, (_, i) => fila({ source_id: String(i) })));
    expect(puntosDelDia(con(4), 1)).toMatchObject({ restantes: 1 });
    expect(puntosDelDia(con(6), 2)).toMatchObject({ restantes: 4 });
    expect(puntosDelDia(con(2), 1)).toMatchObject({ restantes: 1 });
    expect(puntosDelDia(con(2), 0)).toMatchObject({ restantes: 0 });
  });
  it('etiqueta de accesibilidad', () => {
    const dia = agruparPorDia(l);
    expect(etiquetaDia('2026-11-17', dia['2026-11-17'], '2026-11-17')).toBe('17 de noviembre, hoy: 1 evento; 1 pago');
    expect(etiquetaDia('2026-11-14', [], '2026-11-17')).toBe('14 de noviembre');
    expect(etiquetaDia('2026-11-16', aElementos([fila({}), fila({ source_id: 'x' })]), '2026-11-17')).toBe('16 de noviembre: 2 eventos');
  });
});

describe('frecuencia de los pagos', () => {
  const pago = (id: string) => fila({ kind: 'payment', source_id: id, title: id, status: 'scheduled' });
  const frecuencias = new Map<string, InfoPago>([
    ['unico', { frecuencia: 'once', duenoSolo: null }],
    ['mensual', { frecuencia: 'monthly', duenoSolo: null }],
    ['anual', { frecuencia: 'yearly', duenoSolo: null }],
  ]);
  it('sale del recurrente de origen (calendar_range no la trae); sin dato o en un evento es null', () => {
    const l = aElementos([pago('unico'), pago('mensual'), pago('anual'), pago('desconocido'), fila({ source_id: 'unico' })], frecuencias);
    const de = (id: string, tipo: string) => l.find((e) => e.origenId === id && e.tipo === tipo)?.frecuencia;
    expect([de('unico', 'payment'), de('mensual', 'payment'), de('anual', 'payment'), de('desconocido', 'payment')]).toEqual([
      'once',
      'monthly',
      'yearly',
      null,
    ]);
    // Un evento con el mismo id que un recurrente no se confunde con un pago.
    expect(de('unico', 'event')).toBeNull();
    expect(aElementos([pago('unico')])[0].frecuencia).toBeNull();
    expect(aElementos([fila({ source_id: 'unico' })], frecuencias)[0].frecuencia).toBeNull();
  });
  it('dueño en solitario: sale del recurrente (esPersonal); compartido, sin dato o un evento, null', () => {
    const rec = (id: string, split_mode: 'half' | 'only_m1' | 'only_m2' | 'pot', paid_by: 'm1' | 'm2' | 'pot') => ({
      id,
      frequency: 'monthly' as const,
      split_mode,
      paid_by,
    });
    const info = infoPagos([
      rec('solo1', 'only_m1', 'm1'),
      rec('solo2', 'only_m2', 'm2'),
      rec('paga1_de2', 'only_m2', 'm1'),
      rec('mitad', 'half', 'm1'),
      rec('bote', 'pot', 'pot'),
    ]);
    const l = aElementos(['solo1', 'solo2', 'paga1_de2', 'mitad', 'bote', 'x'].map(pago), info);
    expect(l.map((e) => [e.origenId, e.duenoSolo]).sort()).toEqual(
      [['solo1', 'm1'], ['solo2', 'm2'], ['paga1_de2', null], ['mitad', null], ['bote', null], ['x', null]].sort(),
    );
    expect(l.find((e) => e.origenId === 'solo1')?.frecuencia).toBe('monthly');
    // Un evento con el mismo id no hereda el dueño; sin mapa, null.
    expect(aElementos([fila({ source_id: 'solo1' })], info)[0].duenoSolo).toBeNull();
    expect(aElementos([pago('solo1')])[0].duenoSolo).toBeNull();
  });
  it('se conserva al agrupar por días', () => {
    const [e] = aElementos([pago('mensual')], frecuencias);
    expect(agruparPorDia([e])['2026-11-17'][0].frecuencia).toBe('monthly');
  });
  it('accesibilidad: «Pago único», «Pago recurrente» o «Pago» si no se sabe', () => {
    const l = aElementos([pago('unico'), pago('mensual'), pago('anual'), pago('x')], frecuencias);
    const [unico, mensual, anual, sin] = ['unico', 'mensual', 'anual', 'x'].map((id) => l.find((e) => e.origenId === id)!);
    const etiqueta = (e: typeof unico) => etiquetaAccesible(e, lineaElemento(e, ctx), ctx);
    expect(etiqueta(unico)).toMatch(/\. Pago único$/);
    expect(etiqueta(mensual)).toMatch(/\. Pago recurrente$/);
    expect(etiqueta(anual)).toMatch(/\. Pago recurrente$/);
    expect(etiqueta(sin)).toMatch(/\. Pago$/);
  });
  it('el resumen del día los distingue: «1 pago único; 2 pagos recurrentes»', () => {
    const l = aElementos([pago('unico'), pago('mensual'), pago('anual'), pago('x')], frecuencias);
    expect(resumenDia(l)).toBe('1 pago único; 2 pagos recurrentes; 1 pago');
    expect(resumenDia(aElementos([pago('unico')], frecuencias))).toBe('1 pago único');
    expect(resumenDia(aElementos([pago('mensual')], frecuencias))).toBe('1 pago recurrente');
  });
});

describe('línea de cada fila', () => {
  it('eventos', () => {
    expect(lineaElemento(aElementos([fila({ start_time: '21:30:00' })])[0], ctx)).toBe('21:30');
    expect(lineaElemento(aElementos([fila({ recurrence: 'yearly' })])[0], ctx)).toBe('Todo el día · cada año');
    expect(lineaElemento(aElementos([fila({ start_time: '19:00:00', attendees: 'm2' })])[0], ctx)).toBe('19:00 · Solo va Meri');
    expect(lineaElemento(aElementos([fila({ attendees: 'm1' })])[0], ctx)).toBe('Todo el día · Solo vas tú');
  });
  it('«Pendiente de borrar»: toda la serie o solo esa fecha', () => {
    const [domingo] = aElementos([fila({ source_id: 'c', occurs_on: '2027-03-15', recurrence: 'yearly' })]);
    const [otroAnio] = aElementos([fila({ source_id: 'c', occurs_on: '2028-03-15', recurrence: 'yearly' })]);
    const soloEsa = new Set([claveBorrado('c', '2027-03-15')]);
    expect(lineaElemento(domingo, { ...ctx, pendientesDeBorrar: soloEsa })).toBe('Todo el día · cada año · Pendiente de borrar');
    expect(lineaElemento(otroAnio, { ...ctx, pendientesDeBorrar: soloEsa })).toBe('Todo el día · cada año');
    const serie = new Set([claveBorrado('c')]);
    expect(lineaElemento(otroAnio, { ...ctx, pendientesDeBorrar: serie })).toBe('Todo el día · cada año · Pendiente de borrar');
    expect(lineaElemento(domingo, { ...ctx, pendientesDeBorrar: new Set(['otro']) })).toBe('Todo el día · cada año');
  });
  it('pagos: importe, reparto y «~» en los variables sin importe', () => {
    const recurrentes = new Map([
      ['n', { paid_by: 'pot' as const, split_mode: 'pot' as const, split_pct_m1: null }],
      ['l', { paid_by: 'm1' as const, split_mode: 'half' as const, split_pct_m1: null }],
    ]);
    const [netflix] = aElementos([fila({ kind: 'payment', source_id: 'n', amount_cents: 1299, status: 'scheduled' })]);
    const [luz] = aElementos([fila({ kind: 'payment', source_id: 'l', amount_cents: 4800, is_estimate: true, status: 'scheduled' })]);
    const [luzPendiente] = aElementos([fila({ kind: 'payment', source_id: 'l', amount_cents: 4800, is_estimate: true, status: 'pending' })]);
    expect(texto(lineaElemento(netflix, { ...ctx, recurrentes }))).toBe('12,99 € · bote común');
    expect(texto(lineaElemento(luz, { ...ctx, recurrentes }))).toBe('~48,00 € · a medias');
    expect(texto(lineaElemento(luzPendiente, { ...ctx, recurrentes }))).toBe('~48,00 € · a medias · falta el importe');
    expect(texto(lineaElemento(netflix, ctx))).toBe('12,99 €');
  });
});

describe('lista', () => {
  const hoy = '2026-11-17';
  const l = aElementos([
    fila({ source_id: 'a', title: 'Pasado', occurs_on: '2026-11-03' }),
    fila({ source_id: 'b', title: 'Hoy', occurs_on: '2026-11-17' }),
    fila({ source_id: 'c', title: 'Sábado', occurs_on: '2026-11-21' }),
    fila({ source_id: 'd', title: 'Diciembre', occurs_on: '2026-12-02' }),
  ]);
  const base = { hoy, elementos: l, filtros: [] as Filtros, seleccionado: null };

  it('mes actual: «Próximos», de hoy a fin de mes', () => {
    const r = construirLista({ ...base, vista: 'mes', ancla: '2026-11-17' });
    expect(r.titulo).toBe('Próximos');
    expect(r.conDia).toBe(true);
    expect(r.secciones[0].elementos.map((e) => e.titulo)).toEqual(['Hoy', 'Sábado']);
  });
  it('otro mes: entero, «En diciembre»', () => {
    const r = construirLista({ ...base, vista: 'mes', ancla: '2026-12-10' });
    expect(r.titulo).toBe('En diciembre');
    expect(r.secciones[0].elementos.map((e) => e.titulo)).toEqual(['Diciembre']);
    expect(construirLista({ ...base, vista: 'mes', ancla: '2027-01-10' }).titulo).toBe('En enero de 2027');
  });
  it('mes pasado: entero', () => {
    const r = construirLista({ ...base, vista: 'mes', ancla: '2026-10-10', elementos: aElementos([fila({ occurs_on: '2026-10-05' })]) });
    expect(r.secciones[0].elementos).toHaveLength(1);
  });
  it('estados vacíos', () => {
    expect(construirLista({ ...base, vista: 'mes', ancla: '2027-03-10' }).vacio).toBe('Aún no hay nada en el calendario');
    expect(construirLista({ ...base, vista: 'mes', ancla: '2027-03-10', filtros: ['payment'] }).vacio).toBe('Nada de este tipo este mes');
    expect(construirLista({ ...base, vista: 'mes', ancla: '2026-11-30', elementos: l.slice(0, 1) }).vacio).toBe('No queda nada este mes');
  });
  it('día seleccionado: la lista pasa a ser de ese día; vacío → «Nada este día»', () => {
    const r = construirLista({ ...base, vista: 'mes', ancla: '2026-11-17', seleccionado: '2026-11-21' });
    expect(r.titulo).toBe('Sábado 21');
    expect(r.conDia).toBe(false);
    expect(r.secciones[0].elementos.map((e) => e.titulo)).toEqual(['Sábado']);
    expect(construirLista({ ...base, vista: 'mes', ancla: '2026-11-17', seleccionado: '2026-11-20' }).vacio).toBe('Nada este día');
  });
  describe('info extra del día (cumpleaños y secretos)', () => {
    const dia = '2026-11-17';
    const e = (id: string, extra: Partial<FilaRango> = {}) => fila({ source_id: id, title: id, occurs_on: dia, ...extra });
    const lista = (filas: FilaRango[], filtros: Filtros = []) =>
      construirLista({
        vista: 'mes',
        ancla: dia,
        seleccionado: dia,
        hoy: dia,
        elementos: filtrar(aElementos(filas), filtros),
        filtros,
      });
    const titulos = (r: ReturnType<typeof lista>) => r.secciones.map((s) => s.elementos.map((x) => x.titulo));

    it('eventos y pagos primero, por hora; después los cumpleaños y los secretos', () => {
      const r = lista([
        e('Secreto tarde', { is_secret: true, start_time: '22:00:00' }),
        e('Cumple A', { category: 'birthday' }),
        e('Cena', { start_time: '21:00:00' }),
        e('Cumple B', { category: 'birthday' }),
        e('Comida', { start_time: '14:00:00' }),
        e('Secreto pronto', { is_secret: true, start_time: '09:00:00' }),
        e('Luz', { kind: 'payment' }),
      ]);
      expect(r.secciones).toHaveLength(2);
      // Normales: lo de todo el día primero (el pago), luego por hora.
      expect(titulos(r)[0]).toEqual(['Luz', 'Comida', 'Cena']);
      // Extra: cumpleaños (en orden de título) y luego secretos (por hora).
      expect(titulos(r)[1]).toEqual(['Cumple de Cumple A', 'Cumple de Cumple B', 'Secreto pronto', 'Secreto tarde']);
      expect(r.secciones[0].extra).toBeUndefined();
      expect(r.secciones[1]).toMatchObject({ extra: true, cabecera: 'Cumpleaños y secretos', clave: `${dia}:extra` });
      expect(r.vacio).toBeNull();
    });
    it('si el día solo tiene cumpleaños o secretos, salen ellos solos (sin sección normal vacía)', () => {
      const cumples = lista([e('Ana', { category: 'birthday' })]);
      expect(cumples.secciones).toHaveLength(1);
      expect(cumples.secciones[0]).toMatchObject({ extra: true, cabecera: 'Cumpleaños' });
      expect(cumples.vacio).toBeNull();
      const uno = lista([e('Sorpresa', { is_secret: true })]);
      expect(uno.secciones[0]).toMatchObject({ extra: true, cabecera: 'Secreto' });
      const dos = lista([e('S1', { is_secret: true }), e('S2', { is_secret: true })]);
      expect(dos.secciones[0].cabecera).toBe('Secretos');
    });
    it('un día sin extras queda como antes: una sola sección, sin «extra»; vacío sigue siendo «Nada este día»', () => {
      const r = lista([e('Cena')]);
      expect(r.secciones).toHaveLength(1);
      expect(r.secciones[0].extra).toBeUndefined();
      const vacio = lista([]);
      expect(vacio.vacio).toBe('Nada este día');
      expect(vacio.secciones).toHaveLength(1);
    });
    it('un cumpleaños secreto sale una sola vez, entre los cumpleaños', () => {
      const r = lista([e('Ana', { category: 'birthday', is_secret: true }), e('Sorpresa', { is_secret: true })]);
      expect(titulos(r)).toEqual([['Cumple de Ana', 'Sorpresa']]);
    });
    it('el filtro Cumpleaños sigue enseñando solo cumpleaños (ahora como info extra)', () => {
      const r = lista([e('Ana', { category: 'birthday' }), e('Cena')], ['birthday']);
      expect(titulos(r)).toEqual([['Cumple de Ana']]);
    });
    it('las claves de las secciones y de los elementos siguen siendo únicas, y cada elemento conserva su `inicio`', () => {
      const viaje = e('Roma', { occurs_on: '2026-11-15', ends_on: '2026-11-19', is_secret: true, category: 'trip' });
      const r = lista([viaje, e('Ana', { category: 'birthday' }), e('Cena')]);
      const claves = r.secciones.flatMap((s) => s.elementos.map((x) => x.clave));
      expect(new Set(claves).size).toBe(claves.length);
      expect(new Set(r.secciones.map((s) => s.clave)).size).toBe(r.secciones.length);
      // Un viaje secreto de varios días va a la info extra con el inicio de su repetición (riesgo TW060).
      const roma = r.secciones[1].elementos.find((x) => x.titulo === 'Roma')!;
      expect(roma).toMatchObject({ inicio: '2026-11-15', fecha: dia, diaN: 3 });
    });
    it('también en la Semana (día seleccionado)', () => {
      const r = construirLista({
        vista: 'semana',
        ancla: dia,
        seleccionado: dia,
        hoy: dia,
        elementos: aElementos([e('Ana', { category: 'birthday' }), e('Cena')]),
        filtros: [],
      });
      expect(titulos(r)).toEqual([['Cena'], ['Cumple de Ana']]);
    });
  });
  it('un día seleccionado de otro periodo se ignora', () => {
    expect(construirLista({ ...base, vista: 'mes', ancla: '2026-12-10', seleccionado: '2026-11-21' }).titulo).toBe('En diciembre');
  });
  it('semana: sin día seleccionado no hay lista (la vista de la semana ya lo enseña); vacía, «Nada esta semana»', () => {
    expect(construir({ ...base, vista: 'semana', ancla: '2026-11-17' })).toBeNull();
    const vacia = construirLista({ ...base, vista: 'semana', ancla: '2026-12-10' });
    expect(vacia).toMatchObject({ titulo: 'Semana del 7 dic', vacio: 'Nada esta semana', secciones: [] });
    expect(construirLista({ ...base, vista: 'semana', ancla: '2026-12-10', hoy: '2026-12-08' }).titulo).toBe('Esta semana');
  });
  it('semana con un día seleccionado: la lista de ese día', () => {
    const r = construirLista({ ...base, vista: 'semana', ancla: '2026-11-17', seleccionado: '2026-11-17' });
    expect(r.titulo).toBe('Martes 17');
    expect(r.secciones[0].elementos.map((e) => e.titulo)).toEqual(['Hoy']);
  });
});

describe('eventos de varios días', () => {
  const roma = fila({ source_id: 'roma', title: 'Roma', occurs_on: '2026-11-14', ends_on: '2026-11-18', category: 'trip', recurrence: 'yearly' });
  const [e] = aElementos([roma]);

  it('lee ends_on, la categoría, y un servidor sin migrar lo trata como un día y «otros»', () => {
    expect(e).toMatchObject({ inicio: '2026-11-14', fin: '2026-11-18', fecha: '2026-11-14', diaN: null, categoria: 'trip' });
    const [viejo] = aElementos([fila({})]);
    expect(viejo).toMatchObject({ inicio: '2026-11-17', fin: '2026-11-17', categoria: 'other', anioNacimiento: null });
    // Una categoría desconocida no rompe nada.
    expect(aElementos([fila({ category: 'rara' })])[0].categoria).toBe('other');
  });

  it('se reparte por todos sus días: fecha y diaN cambian, inicio y fin no', () => {
    const dias = agruparPorDia([e]);
    expect(Object.keys(dias)).toEqual(['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']);
    const tercero = dias['2026-11-16'][0];
    expect(tercero).toMatchObject({ fecha: '2026-11-16', diaN: 3, inicio: '2026-11-14', fin: '2026-11-18' });
  });

  it('riesgo 1: pendiente de borrar se mira por el INICIO de la repetición, no por el día pintado', () => {
    const tercero = agruparPorDia([e])['2026-11-16'][0];
    const soloEsta = new Set([claveBorrado('roma', '2026-11-14')]);
    expect(pendienteDeBorrar(tercero, { pendientesDeBorrar: soloEsta })).toBe(true);
    // La clave del día pintado NO es la de la repetición.
    expect(pendienteDeBorrar(tercero, { pendientesDeBorrar: new Set([claveBorrado('roma', '2026-11-16')]) })).toBe(false);
    expect(lineaElemento(tercero, { ...ctx, pendientesDeBorrar: soloEsta })).toContain('Pendiente de borrar');
  });

  it('claves únicas por día pintado (React no repite claves)', () => {
    const claves = Object.values(agruparPorDia([e])).flat().map((x) => x.clave);
    expect(new Set(claves).size).toBe(claves.length);
    expect(claves).toHaveLength(5);
  });

  it('no lleva punto en la rejilla (se dibuja como barra) pero sí candado si es secreto', () => {
    const dia = agruparPorDia([e, ...aElementos([fila({ source_id: 'c', title: 'Cena', occurs_on: '2026-11-16' })])]);
    const p = puntosDelDia(dia['2026-11-16']);
    expect(p.puntos.map((x) => x.titulo)).toEqual(['Cena']);
    const [secreto] = aElementos([{ ...roma, is_secret: true }]);
    expect(puntosDelDia(agruparPorDia([secreto])['2026-11-15'])).toMatchObject({ puntos: [], secreto: true });
  });

  it('en un día va antes que los de todo el día y los de hora', () => {
    const l = aElementos([
      fila({ source_id: 'a', title: 'Cena', occurs_on: '2026-11-16', start_time: '21:00:00' }),
      fila({ source_id: 'b', title: 'Alquiler', occurs_on: '2026-11-16' }),
      roma,
    ]);
    expect(agruparPorDia(l)['2026-11-16'].map((x) => x.titulo)).toEqual(['Roma', 'Alquiler', 'Cena']);
  });

  it('líneas: la repetición entera («14 – 18 nov») y cada día («Día 2 de 5 · hasta el mié 18»)', () => {
    expect(lineaElemento(e, ctx)).toBe('14 – 18 nov · cada año');
    const segundo = agruparPorDia([e])['2026-11-15'][0];
    expect(lineaElemento(segundo, ctx)).toBe('Día 2 de 5 · hasta el mié 18 · cada año');
    expect(rangoCorto('2026-10-28', '2026-11-03')).toBe('28 oct – 3 nov');
  });

  it('en «Próximos», un viaje que empezó el mes anterior dice solo hasta cuándo', () => {
    const [largo] = aElementos([fila({ source_id: 'l', title: 'Japón', occurs_on: '2026-10-28', ends_on: '2026-11-03', category: 'trip' })]);
    const r = construirLista({ vista: 'mes', ancla: '2026-11-01', seleccionado: null, hoy: '2026-11-01', elementos: [largo], filtros: [] });
    const [fila1] = r.secciones[0].elementos;
    expect(fila1.fecha).toBe('2026-11-01');
    expect(fila1.inicio).toBe('2026-10-28');
    expect(lineaElemento(fila1, ctx)).toBe('Hasta el 3 nov');
  });

  it('«Próximos» lo pone una sola vez mientras no haya terminado, también si empezó antes de hoy', () => {
    const r = construirLista({ vista: 'mes', ancla: '2026-11-16', seleccionado: null, hoy: '2026-11-16', elementos: [e], filtros: [] });
    expect(r.secciones[0].elementos).toHaveLength(1);
    const despues = construirLista({ vista: 'mes', ancla: '2026-11-19', seleccionado: null, hoy: '2026-11-19', elementos: [e], filtros: [] });
    expect(despues.secciones[0].elementos).toHaveLength(0);
    expect(despues.vacio).toBe('No queda nada este mes');
  });

  it('el día seleccionado lo enseña en cada día que dura', () => {
    const r = construirLista({ vista: 'mes', ancla: '2026-11-16', seleccionado: '2026-11-16', hoy: '2026-11-16', elementos: [e], filtros: [] });
    expect(r.secciones[0].elementos[0]).toMatchObject({ diaN: 3, inicio: '2026-11-14' });
  });

  it('un viaje de octubre que sigue en noviembre aparece en el mes que lo toca', () => {
    const [largo] = aElementos([fila({ occurs_on: '2026-10-28', ends_on: '2026-11-03' })]);
    const oct = construirLista({ vista: 'mes', ancla: '2026-10-10', seleccionado: null, hoy: '2026-11-17', elementos: [largo], filtros: [] });
    const dic = construirLista({ vista: 'mes', ancla: '2026-12-10', seleccionado: null, hoy: '2026-11-17', elementos: [largo], filtros: [] });
    expect(oct.secciones[0].elementos).toHaveLength(1);
    expect(dic.secciones[0].elementos).toHaveLength(0);
  });

  it('etiqueta de la celda y resumen', () => {
    const l = aElementos([
      roma,
      fila({ source_id: 'c', title: 'Cena', occurs_on: '2026-11-16' }),
      fila({ source_id: 'd', title: 'Cine', occurs_on: '2026-11-16' }),
      fila({ source_id: 'k', title: 'Carmen', occurs_on: '2026-11-16', category: 'birthday' }),
      fila({ kind: 'payment', source_id: 'p', title: 'Luz', occurs_on: '2026-11-16' }),
    ]);
    const dia = agruparPorDia(l)['2026-11-16'];
    expect(resumenDia(dia)).toBe('Roma, día 3 de 5; 1 cumpleaños; 2 eventos; 1 pago');
    expect(etiquetaDia('2026-11-16', dia, '2026-11-16')).toBe('16 de noviembre, hoy: Roma, día 3 de 5; 1 cumpleaños; 2 eventos; 1 pago');
  });
});

describe('categorías y filtros', () => {
  const l = aElementos([
    fila({ source_id: 'a', title: 'Roma', category: 'trip' }),
    fila({ source_id: 'b', title: 'Tapas', category: 'eating_out' }),
    fila({ source_id: 'c', title: 'Cine', category: 'leisure' }),
    fila({ source_id: 'd', title: 'Carmen', category: 'birthday' }),
    fila({ source_id: 'e', title: 'Médico', category: 'other' }),
    fila({ source_id: 'f', title: 'Sin categoría' }),
    fila({ kind: 'payment', source_id: 'p', title: 'Luz' }),
  ]);
  const titulos = (f: Filtros) => filtrar(l, f).map((e) => e.titulo).sort();

  it('claveFiltro: pago, categoría conocida; sin categoría o desconocida, «other»', () => {
    const por = (t: string) => l.find((e) => e.titulo === t)!;
    const [roma, carmen, medico, sinCat, luz] = ['Roma', 'Cumple de Carmen', 'Médico', 'Sin categoría', 'Luz'].map(por);
    expect(claveFiltro(roma)).toBe('trip');
    expect(claveFiltro(carmen)).toBe('birthday');
    expect(claveFiltro(medico)).toBe('other');
    expect(claveFiltro(sinCat)).toBe('other');
    expect(claveFiltro(luz)).toBe('payment');
    expect(claveFiltro({ tipo: 'event', categoria: 'rara' as never })).toBe('other');
    expect(claveFiltro({ tipo: 'event', categoria: null })).toBe('other');
  });
  it('cada opción es solo la suya; «other» ya no incluye viajes ni ocio', () => {
    expect(titulos(['other'])).toEqual(['Médico', 'Sin categoría']);
    expect(titulos(['trip'])).toEqual(['Roma']);
    expect(titulos(['eating_out'])).toEqual(['Tapas']);
    expect(titulos(['leisure'])).toEqual(['Cine']);
    expect(titulos(['birthday'])).toEqual(['Cumple de Carmen']);
    expect(titulos(['payment'])).toEqual(['Luz']);
  });
  it('varios filtros: unión; ninguno: todo', () => {
    expect(titulos(['trip', 'birthday'])).toEqual(['Cumple de Carmen', 'Roma']);
    expect(titulos(['leisure', 'payment', 'other'])).toEqual(['Cine', 'Luz', 'Médico', 'Sin categoría']);
    expect(titulos([])).toHaveLength(7);
    expect(filtrar(l, [])).toBe(l);
  });
  it('construirLista: textos de vacío con y sin filtros', () => {
    const base = { vista: 'mes' as const, ancla: '2027-03-10', seleccionado: null, hoy: '2026-11-17', elementos: [] as Elemento[] };
    expect(construirLista({ ...base, filtros: [] })?.vacio).toBe('Aún no hay nada en el calendario');
    expect(construirLista({ ...base, filtros: ['payment'] })?.vacio).toBe('Nada de este tipo este mes');
    expect(construirLista({ ...base, filtros: ['trip', 'leisure'] })?.vacio).toBe('Nada de este tipo este mes');
  });
});

describe('cumpleaños', () => {
  const cumple = (extra: Partial<FilaRango> = {}) =>
    aElementos([fila({ source_id: 'k', title: 'Carmen', occurs_on: '2027-03-15', recurrence: 'yearly', category: 'birthday', attendees: 'm2', birth_year: 1966, ...extra })])[0];

  it('el título es «Cumple de …» y la línea dice la edad y de parte de quién', () => {
    expect(cumple().titulo).toBe('Cumple de Carmen');
    expect(lineaElemento(cumple(), ctx)).toBe('Cumple 61 · de parte de Meri');
    expect(lineaElemento(cumple({ attendees: 'm1' }), ctx)).toBe('Cumple 61 · de tu parte');
    expect(lineaElemento(cumple({ attendees: 'both' }), ctx)).toBe('Cumple 61 · de parte de los dos');
  });
  it('sin año de nacimiento: «De parte de Meri»; sin pareja unida no dice de parte de quién', () => {
    expect(lineaElemento(cumple({ birth_year: null }), ctx)).toBe('De parte de Meri');
    expect(lineaElemento(cumple(), { ...ctx, conPareja: false })).toBe('Cumple 61');
    expect(lineaElemento(cumple({ birth_year: null }), { ...ctx, conPareja: false })).toBe('');
  });
  it('con una solicitud de borrado pendiente de la serie, lo dice', () => {
    expect(lineaElemento(cumple(), { ...ctx, pendientesDeBorrar: new Set([claveBorrado('k')]) })).toBe(
      'Cumple 61 · de parte de Meri · Pendiente de borrar',
    );
  });
  it('año de nacimiento = el año de la repetición (o posterior): sin edad', () => {
    expect(cumple({ birth_year: 2027 }).anioNacimiento).toBe(2027);
    expect(lineaElemento(cumple({ birth_year: 2027 }), ctx)).toBe('De parte de Meri');
  });
});

describe('etiqueta accesible de una fila', () => {
  it('dice «Vais los dos» (el color no es lo único que lo cuenta) y la categoría', () => {
    const [cena] = aElementos([fila({ title: 'Cena', start_time: '21:30:00', category: 'eating_out', attendees: 'both' })]);
    const linea = lineaElemento(cena, ctx);
    expect(etiquetaAccesible(cena, linea, ctx)).toBe('Cena. 21:30. Comer fuera. Vais los dos');
    expect(etiquetaAccesible(cena, linea, { ...ctx, conPareja: false })).toBe('Cena. 21:30. Comer fuera');
  });
  it('un pago o un secreto', () => {
    const [pago] = aElementos([fila({ kind: 'payment', title: 'Luz', amount_cents: 4800 })]);
    expect(etiquetaAccesible(pago, lineaElemento(pago, ctx), ctx)).toMatch(/^Luz\. .*\. Pago$/);
    const [secreto] = aElementos([fila({ title: 'Sorpresa', is_secret: true, attendees: 'm1' })]);
    expect(etiquetaAccesible(secreto, lineaElemento(secreto, ctx), ctx)).toContain('Secreto, solo tú');
  });
});
