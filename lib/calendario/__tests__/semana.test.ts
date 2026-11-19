import { type ContextoLinea, type FilaRango, aElementos } from '@/lib/calendario/agrupar';
import { barrasDeColumna, filasSemana, lineaSemana } from '@/lib/calendario/semana';
import { claveBorrado } from '@/lib/calendario/agrupar';
import { semanaDe } from '@/lib/calendario/rejilla';

const fila = (extra: Partial<FilaRango>): FilaRango => ({
  kind: 'event',
  source_id: 'e1',
  occurs_on: '2026-12-14',
  title: 'Cena',
  start_time: null,
  all_day: true,
  ...extra,
});

// Semana del lunes 14 al domingo 20 de diciembre de 2026.
const DIAS = semanaDe('2026-12-14');
const HOY = '2026-12-15';
const ctx: ContextoLinea = { yo: 'm1', nombrePareja: 'Meri' };
const opciones = { hoy: HOY };

const del = (filas: FilaRango[]) => aElementos(filas);
const linea = (filas: FilaRango[], iso: string, i = 0, c: ContextoLinea = ctx) => {
  const f = filasSemana(DIAS, del(filas), opciones).filas.find((x) => x.iso === iso)!;
  return lineaSemana(f.lineas[i], c);
};

describe('filasSemana', () => {
  it('una fila por día de lunes a domingo; los vacíos sin líneas', () => {
    const { filas } = filasSemana(DIAS, [], opciones);
    expect(filas.map((f) => f.iso)).toEqual(DIAS);
    expect(filas.every((f) => f.lineas.length === 0 && f.mas === 0)).toBe(true);
  });

  it('5 elementos en un día → 3 líneas y «+2 más»', () => {
    const cinco = ['A', 'B', 'C', 'D', 'E'].map((n) => fila({ source_id: n, title: n, occurs_on: '2026-12-16', start_time: '10:00:00' }));
    const f = filasSemana(DIAS, del(cinco), opciones).filas[2];
    expect(f.lineas.map((l) => l.elemento.titulo)).toEqual(['A', 'B', 'C']);
    expect(f.mas).toBe(2);
    // Con 3 justos no hay «más».
    expect(filasSemana(DIAS, del(cinco.slice(0, 3)), opciones).filas[2].mas).toBe(0);
  });

  it('el máximo de líneas es un parámetro', () => {
    const tres = ['A', 'B', 'C'].map((n) => fila({ source_id: n, title: n, occurs_on: '2026-12-16' }));
    const f = filasSemana(DIAS, del(tres), { hoy: HOY, maxLineas: 2 }).filas[2];
    expect(f.lineas).toHaveLength(2);
    expect(f.mas).toBe(1);
  });

  it('orden: todo el día antes que con hora; luego la hora y el título', () => {
    const l = del([
      fila({ source_id: 'a', title: 'Cine', occurs_on: '2026-12-16', start_time: '19:00:00' }),
      fila({ source_id: 'b', title: 'Alquiler', occurs_on: '2026-12-16' }),
      fila({ source_id: 'c', title: 'Cena', occurs_on: '2026-12-16', start_time: '21:30:00' }),
    ]);
    expect(filasSemana(DIAS, l, opciones).filas[2].lineas.map((x) => x.elemento.titulo)).toEqual(['Alquiler', 'Cine', 'Cena']);
  });

  describe('eventos de varios días', () => {
    const roma = fila({ source_id: 'roma', title: 'Roma', occurs_on: '2026-12-15', ends_on: '2026-12-18', category: 'trip' });

    it('con barra, el título sale UNA vez, en su primer día, y primero («hasta el vie 18»)', () => {
      const l = del([roma, fila({ source_id: 'x', title: 'Cena', occurs_on: '2026-12-15', start_time: '21:00:00' })]);
      const { filas, segmentos } = filasSemana(DIAS, l, opciones);
      expect(segmentos).toHaveLength(1);
      const martes = filas[1];
      expect(martes.lineas.map((x) => [x.elemento.titulo, x.sufijo])).toEqual([['Roma', 'hasta el vie 18'], ['Cena', null]]);
      // Miércoles, jueves y viernes no repiten la línea: lo dice la barra.
      expect(filas[2].lineas).toEqual([]);
      expect(filas[3].lineas).toEqual([]);
      expect(filas[4].lineas).toEqual([]);
    });

    it('el que empezó la semana anterior pone «desde el jue 10» el lunes', () => {
      const largo = fila({ source_id: 'l', title: 'Japón', occurs_on: '2026-12-10', ends_on: '2026-12-16', category: 'trip' });
      const f = filasSemana(DIAS, del([largo]), opciones).filas;
      expect(f[0].lineas.map((x) => x.sufijo)).toEqual(['desde el jue 10']);
      expect(f[1].lineas).toEqual([]);
    });

    it('al abrirlo se usa el INICIO de la repetición, no el día de la fila', () => {
      const largo = fila({ source_id: 'l', title: 'Japón', occurs_on: '2026-12-10', ends_on: '2026-12-16' });
      const [l] = filasSemana(DIAS, del([largo]), opciones).filas[0].lineas;
      expect(l.elemento.fecha).toBe('2026-12-14');
      expect(l.elemento.inicio).toBe('2026-12-10');
    });

    it('4 viajes solapados: 3 barras y el cuarto como línea en cada día («día 2 de 4»)', () => {
      const cuatro = ['A', 'B', 'C', 'D'].map((n) =>
        fila({ source_id: n, title: n, occurs_on: '2026-12-15', ends_on: '2026-12-18', category: 'trip' }),
      );
      const { filas, segmentos } = filasSemana(DIAS, del(cuatro), opciones);
      expect(segmentos).toHaveLength(3);
      const sinBarra = new Set(cuatro.map((c) => c.source_id));
      for (const s of segmentos) sinBarra.delete(s.elemento.origenId);
      expect([...sinBarra]).toEqual(['D']);
      // Los otros tres ponen su título una vez, el martes (que se llena: el cuarto pasa a «+1 más»).
      expect(filas[1].lineas.filter((x) => x.sufijo === 'hasta el vie 18')).toHaveLength(3);
      expect(filas[1].mas).toBe(1);
      // El cuarto no tiene barra: sale como línea cada día que le queda a la vista.
      expect(filas[2].lineas.map((x) => [x.elemento.origenId, x.sufijo])).toEqual([['D', 'día 2 de 4']]);
      expect(filas[3].lineas.map((x) => x.sufijo)).toEqual(['día 3 de 4']);
      expect(filas[4].lineas.map((x) => x.sufijo)).toEqual(['día 4 de 4']);
    });

    it('barrasDeColumna: las barras que pasan por un día, de arriba abajo', () => {
      const { segmentos } = filasSemana(DIAS, del([roma, fila({ ...roma, source_id: 'otro', title: 'Otro', occurs_on: '2026-12-16', ends_on: '2026-12-17' })]), opciones);
      expect(barrasDeColumna(segmentos, 0)).toEqual([]);
      expect(barrasDeColumna(segmentos, 1).map((s) => s.carril)).toEqual([0]);
      expect(barrasDeColumna(segmentos, 2).map((s) => s.carril)).toEqual([0, 1]);
    });
  });

  it('etiqueta de accesibilidad de la zona del día', () => {
    const l = del([
      fila({ source_id: 'roma', title: 'Roma', occurs_on: '2026-12-14', ends_on: '2026-12-18' }),
      fila({ source_id: 'a', title: 'Cena', occurs_on: '2026-12-15' }),
      fila({ source_id: 'b', title: 'Cine', occurs_on: '2026-12-15' }),
      fila({ kind: 'payment', source_id: 'p', title: 'Luz', occurs_on: '2026-12-15' }),
    ]);
    const { filas } = filasSemana(DIAS, l, opciones);
    expect(filas[1].etiqueta).toBe('Martes 15 de diciembre, hoy: Roma, día 2 de 5; 2 eventos; 1 pago. Toca para ver el día');
    expect(filas[5].etiqueta).toBe('Sábado 19 de diciembre. Toca para ver el día');
  });
});

describe('lineaSemana', () => {
  it('evento con hora: hora, icono de su categoría y título', () => {
    const p = linea([fila({ title: 'Cena en El Olivo', start_time: '21:30:00', category: 'eating_out', attendees: 'both' })], '2026-12-14');
    expect(p).toMatchObject({ hora: '21:30', icono: 'restaurant-outline', titulo: 'Cena en El Olivo', derecha: null, tachado: false, secreto: false });
    expect(p.etiqueta).toBe('21:30, Cena en El Olivo, comer fuera, vais los dos');
  });
  it('de todo el día y sin categoría: sin hora ni icono', () => {
    const p = linea([fila({ title: 'Dentista', category: 'other' })], '2026-12-14');
    expect(p).toMatchObject({ hora: null, icono: null });
    expect(p.etiqueta).toBe('Dentista, vais los dos');
  });
  it('icono de viaje y de ocio', () => {
    expect(linea([fila({ category: 'leisure' })], '2026-12-14').icono).toBe('ticket-outline');
    expect(linea([fila({ category: 'trip' })], '2026-12-14').icono).toBe('airplane-outline');
  });
  it('sin pareja unida no dice «vais los dos»; con uno solo, quién va', () => {
    expect(linea([fila({})], '2026-12-14', 0, { ...ctx, conPareja: false }).etiqueta).toBe('Cena');
    expect(linea([fila({ attendees: 'm2' })], '2026-12-14').etiqueta).toBe('Cena, solo va Meri');
    expect(linea([fila({ attendees: 'm1' })], '2026-12-14').etiqueta).toBe('Cena, solo vas tú');
  });
  it('pago: el importe va a la derecha, con «~» si es aproximado', () => {
    const exacto = linea([fila({ kind: 'payment', title: 'Netflix', amount_cents: 1299, status: 'scheduled' })], '2026-12-14');
    expect(exacto.derecha?.replace(/ /g, ' ')).toBe('12,99 €');
    expect(exacto).toMatchObject({ hora: null, icono: null, titulo: 'Netflix' });
    const estimado = linea([fila({ kind: 'payment', title: 'Luz', amount_cents: 4800, is_estimate: true, status: 'scheduled' })], '2026-12-14');
    expect(estimado.derecha?.replace(/ /g, ' ')).toBe('~48,00 €');
  });
  it('pago: etiqueta hablada «Pago, Netflix, 12,99 euros, a medias»', () => {
    const recurrentes = new Map([['n', { paid_by: 'm1' as const, split_mode: 'half' as const, split_pct_m1: null }]]);
    const p = linea([fila({ kind: 'payment', source_id: 'n', title: 'Netflix', amount_cents: 1299, status: 'scheduled' })], '2026-12-14', 0, { ...ctx, recurrentes });
    expect(p.etiqueta).toBe('Pago, Netflix, 12,99 euros, a medias');
  });
  it('pago: la etiqueta dice «Pago único» o «Pago recurrente» según el recurrente de origen', () => {
    const fp = fila({ kind: 'payment', source_id: 'n', title: 'Netflix', status: 'scheduled' });
    const frecuencia = (f: 'once' | 'monthly' | 'yearly') => {
      const f1 = filasSemana(DIAS, aElementos([fp], new Map([['n', { frecuencia: f, duenoSolo: null }]])), opciones).filas.find((x) => x.iso === '2026-12-14')!;
      return lineaSemana(f1.lineas[0], ctx).etiqueta;
    };
    expect(frecuencia('once')).toBe('Pago único, Netflix');
    expect(frecuencia('monthly')).toBe('Pago recurrente, Netflix');
    expect(frecuencia('yearly')).toBe('Pago recurrente, Netflix');
  });
  it('cumpleaños: «Cumple de Carmen · 60» (sin año, solo el nombre)', () => {
    const cumple = { source_id: 'k', title: 'Carmen', occurs_on: '2026-12-14', recurrence: 'yearly', category: 'birthday', attendees: 'm2' };
    const con = linea([fila({ ...cumple, birth_year: 1966 })], '2026-12-14');
    expect(con).toMatchObject({ titulo: 'Cumple de Carmen · 60', icono: null, hora: null });
    expect(con.etiqueta).toBe('Cumple de Carmen, cumple 60, de parte de Meri');
    expect(linea([fila(cumple)], '2026-12-14').titulo).toBe('Cumple de Carmen');
  });
  it('secreto: lleva candado', () => {
    expect(linea([fila({ is_secret: true, attendees: 'm1' })], '2026-12-14')).toMatchObject({ secreto: true });
    expect(linea([fila({ is_secret: true, attendees: 'm1' })], '2026-12-14').etiqueta).toContain('secreto');
  });
  it('pendiente de borrar: tachado y lo dice la etiqueta (por el INICIO de la repetición)', () => {
    const roma = fila({ source_id: 'roma', title: 'Roma', occurs_on: '2026-12-15', ends_on: '2026-12-17' });
    const soloEsta = new Set([claveBorrado('roma', '2026-12-15')]);
    const p = linea([roma], '2026-12-15', 0, { ...ctx, pendientesDeBorrar: soloEsta });
    expect(p.tachado).toBe(true);
    expect(p.etiqueta).toContain('pendiente de borrar');
    expect(linea([roma], '2026-12-15', 0, ctx).tachado).toBe(false);
  });
  it('de varios días: el título lleva el sufijo y no hay hora; el título es lo que se recorta', () => {
    const p = linea([fila({ source_id: 'roma', title: 'Roma', occurs_on: '2026-12-15', ends_on: '2026-12-18', start_time: null })], '2026-12-15');
    expect(p).toMatchObject({ titulo: 'Roma · hasta el vie 18', hora: null, derecha: null });
  });
});
