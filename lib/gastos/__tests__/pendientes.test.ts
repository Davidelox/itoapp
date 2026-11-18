import type { Pendiente } from '@/lib/gastos/consultas';
import { contarPendientes, cosaBorrada, descripcionBorrado, resumenPendientes, textoCortoPendiente, tituloPendientes } from '@/lib/gastos/pendientes';

const cobro = { tipo: 'cobro', id: 'c1', cobro: {}, recurrente: { name: 'Luz' } } as unknown as Pendiente;
const pago = { tipo: 'pago', id: 'p1', pago: { amount_cents: 2050 } } as unknown as Pendiente;
const propuesta = { tipo: 'propuesta', id: 'a1' } as unknown as Pendiente;
const borrado = (extra: object) =>
  ({ tipo: 'borrado', id: 'b1', solicitud: {}, etiqueta: 'Gasto', gasto: null, movimiento: null, objetivo: 'expense', objetivoId: 'x', fecha: null, ...extra }) as unknown as Pendiente;

describe('textoCortoPendiente', () => {
  it('construye una frase por tipo', () => {
    expect(textoCortoPendiente(cobro, 'm1', 'Meri')).toBe('Ha llegado Luz');
    expect(textoCortoPendiente(pago, 'm1', 'Meri')).toContain('Meri dice que te ha pagado');
    expect(textoCortoPendiente(propuesta, 'm1', 'Meri')).toBe('Meri propone cambiar los ajustes');
  });
  it('borrado: gasto, movimiento o etiqueta', () => {
    expect(textoCortoPendiente(borrado({ gasto: { concept: 'cena', amount_cents: 2000 } }), 'm1', 'Meri')).toMatch(/^Meri quiere borrar «cena · .*»$/);
    expect(textoCortoPendiente(borrado({}), 'm1', 'Meri')).toBe('Meri quiere borrar «Gasto»');
    expect(
      textoCortoPendiente(borrado({ movimiento: { kind: 'adjustment', amount_cents: 500 } }), 'm1', 'Meri'),
    ).toMatch(/^Meri quiere borrar «Ajuste · .*»$/);
  });
});

describe('borrado de un evento o de un pago recurrente', () => {
  const evento = borrado({ objetivo: 'event', objetivoId: 'e1', fecha: '2027-03-15', etiqueta: 'Cumpleaños de Marta · 15/03/2027' });
  const serie = borrado({ objetivo: 'event', objetivoId: 'e1', fecha: null, etiqueta: 'Cumpleaños de Marta' });
  const recurrente = borrado({ objetivo: 'recurring_payment', objetivoId: 'r1', etiqueta: 'Netflix' });

  it('la frase usa la etiqueta del servidor (con la fecha si es solo un día)', () => {
    expect(textoCortoPendiente(evento, 'm1', 'Meri')).toBe('Meri quiere borrar «Cumpleaños de Marta · 15/03/2027»');
    expect(textoCortoPendiente(serie, 'm1', 'Meri')).toBe('Meri quiere borrar «Cumpleaños de Marta»');
    expect(textoCortoPendiente(recurrente, 'm1', 'Meri')).toBe('Meri quiere borrar «Netflix»');
  });
  it('descripcionBorrado sin gasto ni movimiento devuelve la etiqueta', () => {
    expect(descripcionBorrado(evento as Extract<Pendiente, { tipo: 'borrado' }>, 'm1', 'Meri')).toBe('Cumpleaños de Marta · 15/03/2027');
  });
  it('qué se queda si no se responde', () => {
    const c = (p: Pendiente) => cosaBorrada(p as Extract<Pendiente, { tipo: 'borrado' }>);
    expect(c(evento)).toBe('el evento');
    expect(c(recurrente)).toBe('el pago');
    expect(c(borrado({}))).toBe('el gasto');
    expect(c(borrado({ objetivo: 'pot_movement' }))).toBe('el movimiento');
  });
  it('cuentan como cualquier otro aviso', () => {
    expect(contarPendientes([evento, recurrente, cobro], new Set())).toBe(3);
  });
});

describe('«¿Quién pagó?»', () => {
  const quien = { tipo: 'quienPago', id: 'e1', evento: { id: 'e1', title: 'Cena en Taberna El Olivo' } } as unknown as Pendiente;
  it('frase corta con el título del evento', () => {
    expect(textoCortoPendiente(quien, 'm1', 'Meri')).toBe('¿Quién pagó Cena en Taberna El Olivo?');
  });
  it('cuenta como cualquier otro aviso', () => {
    expect(contarPendientes([quien, cobro], new Set())).toBe(2);
    expect(contarPendientes([quien, cobro], new Set(['e1']))).toBe(1);
  });
});

describe('resumenPendientes', () => {
  it('une los primeros textos con « · »', () => {
    expect(resumenPendientes(['a', 'b', 'c', 'd'])).toBe('a · b · c');
    expect(resumenPendientes(['a', 'b'], 1)).toBe('a');
    expect(resumenPendientes([])).toBe('');
  });
});

describe('tituloPendientes y contarPendientes', () => {
  it('título con el conteo', () => {
    expect(tituloPendientes(3)).toBe('3 cosas pendientes');
  });
  it('no cuenta las ya respondidas', () => {
    expect(contarPendientes([cobro, pago, propuesta], new Set(['p1']))).toBe(2);
    expect(contarPendientes([cobro], new Set(['otro']))).toBe(1);
    expect(contarPendientes([], new Set())).toBe(0);
  });
});
