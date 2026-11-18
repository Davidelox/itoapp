import {
  type FilaRango,
  agruparPorDia,
  aElementos,
  construirLista as construir,
  etiquetaAccesible,
  etiquetaDia,
  filtrar,
  claveBorrado,
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
    expect(filtrar(l, 'payment').map((e) => e.titulo)).toEqual(['Luz']);
    expect(filtrar(l, 'event')).toHaveLength(2);
    expect(filtrar(l, 'todos')).toHaveLength(3);
  });
  it('puntos: azul evento, ámbar pago, máximo 3 y un «+»; candado si hay un secreto', () => {
    const dia = agruparPorDia(l);
    const d17 = puntosDelDia(dia['2026-11-17']);
    expect(d17.puntos.map((e) => e.tipo)).toEqual(['payment', 'event']);
    expect(d17).toMatchObject({ mas: false, secreto: false });
    expect(puntosDelDia(dia['2026-11-18']).secreto).toBe(true);
    const cinco = aElementos(['1', '2', '3', '4', '5'].map((n) => fila({ source_id: n })));
    const p5 = puntosDelDia(cinco);
    expect(p5.puntos).toHaveLength(3);
    expect(p5).toMatchObject({ mas: true, secreto: false });
    expect(puntosDelDia([])).toEqual({ puntos: [], mas: false, secreto: false });
  });
  it('etiqueta de accesibilidad', () => {
    const dia = agruparPorDia(l);
    expect(etiquetaDia('2026-11-17', dia['2026-11-17'], '2026-11-17')).toBe('17 de noviembre, hoy: 1 evento; 1 pago');
    expect(etiquetaDia('2026-11-14', [], '2026-11-17')).toBe('14 de noviembre');
    expect(etiquetaDia('2026-11-16', aElementos([fila({}), fila({ source_id: 'x' })]), '2026-11-17')).toBe('16 de noviembre: 2 eventos');
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
  const base = { hoy, elementos: l, filtro: 'todos' as const, seleccionado: null };

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
    expect(construirLista({ ...base, vista: 'mes', ancla: '2027-03-10', filtro: 'payment' }).vacio).toBe('Nada de este tipo este mes');
    expect(construirLista({ ...base, vista: 'mes', ancla: '2026-11-30', elementos: l.slice(0, 1) }).vacio).toBe('No queda nada este mes');
  });
  it('día seleccionado: la lista pasa a ser de ese día; vacío → «Nada este día»', () => {
    const r = construirLista({ ...base, vista: 'mes', ancla: '2026-11-17', seleccionado: '2026-11-21' });
    expect(r.titulo).toBe('Sábado 21');
    expect(r.conDia).toBe(false);
    expect(r.secciones[0].elementos.map((e) => e.titulo)).toEqual(['Sábado']);
    expect(construirLista({ ...base, vista: 'mes', ancla: '2026-11-17', seleccionado: '2026-11-20' }).vacio).toBe('Nada este día');
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
    const r = construirLista({ vista: 'mes', ancla: '2026-11-01', seleccionado: null, hoy: '2026-11-01', elementos: [largo], filtro: 'todos' });
    const [fila1] = r.secciones[0].elementos;
    expect(fila1.fecha).toBe('2026-11-01');
    expect(fila1.inicio).toBe('2026-10-28');
    expect(lineaElemento(fila1, ctx)).toBe('Hasta el 3 nov');
  });

  it('«Próximos» lo pone una sola vez mientras no haya terminado, también si empezó antes de hoy', () => {
    const r = construirLista({ vista: 'mes', ancla: '2026-11-16', seleccionado: null, hoy: '2026-11-16', elementos: [e], filtro: 'todos' });
    expect(r.secciones[0].elementos).toHaveLength(1);
    const despues = construirLista({ vista: 'mes', ancla: '2026-11-19', seleccionado: null, hoy: '2026-11-19', elementos: [e], filtro: 'todos' });
    expect(despues.secciones[0].elementos).toHaveLength(0);
    expect(despues.vacio).toBe('No queda nada este mes');
  });

  it('el día seleccionado lo enseña en cada día que dura', () => {
    const r = construirLista({ vista: 'mes', ancla: '2026-11-16', seleccionado: '2026-11-16', hoy: '2026-11-16', elementos: [e], filtro: 'todos' });
    expect(r.secciones[0].elementos[0]).toMatchObject({ diaN: 3, inicio: '2026-11-14' });
  });

  it('un viaje de octubre que sigue en noviembre aparece en el mes que lo toca', () => {
    const [largo] = aElementos([fila({ occurs_on: '2026-10-28', ends_on: '2026-11-03' })]);
    const oct = construirLista({ vista: 'mes', ancla: '2026-10-10', seleccionado: null, hoy: '2026-11-17', elementos: [largo], filtro: 'todos' });
    const dic = construirLista({ vista: 'mes', ancla: '2026-12-10', seleccionado: null, hoy: '2026-11-17', elementos: [largo], filtro: 'todos' });
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
  const titulos = (f: Parameters<typeof filtrar>[1]) => filtrar(l, f).map((e) => e.titulo).sort();

  it('Eventos = todos los eventos menos los cumpleaños; cada categoría, solo la suya', () => {
    expect(titulos('event')).toEqual(['Cine', 'Médico', 'Roma', 'Sin categoría', 'Tapas']);
    expect(titulos('trip')).toEqual(['Roma']);
    expect(titulos('eating_out')).toEqual(['Tapas']);
    expect(titulos('leisure')).toEqual(['Cine']);
    expect(titulos('birthday')).toEqual(['Cumple de Carmen']);
    expect(titulos('payment')).toEqual(['Luz']);
    expect(titulos('todos')).toHaveLength(7);
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
