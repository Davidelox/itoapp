import {
  type Evento,
  type Formulario,
  aDatos,
  aDatosNuevo,
  ajustarAviso,
  avisosDisponibles,
  conCategoria,
  conDiaMes,
  conFecha,
  conFechaFin,
  conSecreto,
  conTipo,
  conTodoElDia,
  conVariosDias,
  deEvento,
  duracionDias,
  fechaCumple,
  formularioNuevo,
  hayErrores,
  horaCorta,
  motivoRepeticion,
  preguntarTrasPresupuesto,
  repeticionesPermitidas,
  textoAsistentes,
  textoAviso,
  textoCuando,
  textoCuandoCumple,
  textoCumplira,
  textoEdad,
  textoEnCurso,
  textoSerie,
  textoVariosDias,
  tituloCumple,
  validar,
} from '@/lib/calendario/evento';
import { soloCambios } from '@/lib/gastos/cambios';

const base = { ...formularioNuevo('2026-11-21'), titulo: '  Cena en la Taberna ' };

const fila: Evento = {
  id: 'e1',
  title: 'Cumpleaños de Marta',
  start_date: '2026-03-15',
  start_time: null,
  all_day: true,
  end_date: null,
  recurrence: 'yearly',
  attendees: 'both',
  budget_cents: null,
  ask_who_paid: false,
  who_paid_resolved_at: null,
  reminder_minutes: 900,
  notes: null,
  is_secret: false,
  category: 'other',
  birth_year: null,
  place_id: null,
  created_by: 'u1',
  version: 3,
  starts_at: '2026-03-14T23:00:00Z',
  ends_at: '2026-03-15T23:00:00Z',
};

describe('aDatos', () => {
  it('recorta el título y las notas; notas vacías → null', () => {
    const d = aDatos({ ...base, notas: '   ' }, 'm1');
    expect(d.title).toBe('Cena en la Taberna');
    expect(d.notes).toBeNull();
    expect(aDatos({ ...base, notas: ' llevar vino ' }, 'm1').notes).toBe('llevar vino');
  });
  it('todo el día limpia la hora; con hora la manda', () => {
    expect(aDatos({ ...base, todoElDia: true, hora: '21:30' }, 'm1')).toMatchObject({ all_day: true, start_time: null });
    expect(aDatos({ ...base, todoElDia: false, hora: '21:30' }, 'm1')).toMatchObject({ all_day: false, start_time: '21:30' });
  });
  it('sin presupuesto no hay «¿Quién pagó?», aunque el interruptor siga activo', () => {
    expect(aDatos({ ...base, presupuesto: '', preguntarQuienPago: true }, 'm1')).toMatchObject({ budget_cents: null, ask_who_paid: false });
    expect(aDatos({ ...base, presupuesto: '60', preguntarQuienPago: true }, 'm1')).toMatchObject({ budget_cents: 6000, ask_who_paid: true });
    expect(aDatos({ ...base, presupuesto: '12,50', preguntarQuienPago: false }, 'm1')).toMatchObject({ budget_cents: 1250, ask_who_paid: false });
  });
  it('si se repite no hay «¿Quién pagó?»', () => {
    expect(aDatos({ ...base, repeticion: 'yearly', presupuesto: '60', preguntarQuienPago: true }, 'm1')).toMatchObject({
      budget_cents: 6000,
      ask_who_paid: false,
    });
  });
  it('si solo va tu pareja no hay «¿Quién pagó?» (nadie podría responderla)', () => {
    const f = { ...base, secreto: true, presupuesto: '60', preguntarQuienPago: true };
    expect(aDatosNuevo({ ...f, asistentes: 'm2' }, 'm1')).toMatchObject({ budget_cents: 6000, ask_who_paid: false });
    expect(aDatos({ ...f, asistentes: 'm1' }, 'm2')).toMatchObject({ ask_who_paid: false });
    expect(aDatos({ ...f, asistentes: 'm1' }, 'm1').ask_who_paid).toBe(true);
    expect(aDatos({ ...f, asistentes: 'both' }, 'm2').ask_who_paid).toBe(true);
  });
  it('editar un evento con «¿Quién pagó?» y pasar a «solo va tu pareja» lo quita', () => {
    const e: Evento = { ...fila, recurrence: 'none', budget_cents: 6000, ask_who_paid: true, all_day: false, start_time: '21:00' };
    const f = { ...deEvento(e), asistentes: 'm2' as const };
    expect(soloCambios(e, aDatos(f, 'm1'))).toEqual({ attendees: 'm2', ask_who_paid: false });
  });
  it('nunca envía time_zone, created_by, starts_at, ends_at ni plan_id', () => {
    const claves = Object.keys(aDatosNuevo({ ...base, secreto: true }, 'm1'));
    for (const k of ['time_zone', 'created_by', 'starts_at', 'ends_at', 'plan_id', 'id', 'version']) {
      expect(claves).not.toContain(k);
    }
  });
  it('is_secret solo al crear', () => {
    expect(aDatosNuevo({ ...base, secreto: true }, 'm1').is_secret).toBe(true);
    expect('is_secret' in aDatos({ ...base, secreto: true }, 'm1')).toBe(false);
  });
});

describe('deEvento y soloCambios', () => {
  it('ida y vuelta sin cambios: no se envía nada', () => {
    expect(soloCambios(fila, aDatos(deEvento(fila), 'm1'))).toEqual({});
    const conHora: Evento = { ...fila, all_day: false, start_time: '21:30', recurrence: 'none', budget_cents: 6000, ask_who_paid: true, notes: 'x', reminder_minutes: 60 };
    expect(soloCambios(conHora, aDatos(deEvento(conHora), 'm1'))).toEqual({});
  });
  it('solo se envía lo que cambia', () => {
    const f = { ...deEvento(fila), titulo: 'Cumple de Marta' };
    expect(soloCambios(fila, aDatos(f, 'm1'))).toEqual({ title: 'Cumple de Marta' });
  });
  it('pasar a repetido quita «¿Quién pagó?» en el mismo cambio', () => {
    const unico: Evento = { ...fila, recurrence: 'none', budget_cents: 6000, ask_who_paid: true, all_day: false, start_time: '21:00' };
    const f = { ...deEvento(unico), repeticion: 'weekly' as const };
    expect(soloCambios(unico, aDatos(f, 'm1'))).toEqual({ recurrence: 'weekly', ask_who_paid: false });
  });
  it('el presupuesto vuelve a texto sin ceros de más', () => {
    expect(deEvento({ ...fila, budget_cents: 6000 }).presupuesto).toBe('60');
    expect(deEvento({ ...fila, budget_cents: 6050 }).presupuesto).toBe('60,50');
  });
});

describe('avisos', () => {
  it('opciones con hora y de todo el día', () => {
    expect(avisosDisponibles(false).map((o) => o.etiqueta)).toEqual(['Sin aviso', 'A la hora', '1 hora antes', '1 día antes']);
    expect(avisosDisponibles(true).map((o) => o.etiqueta)).toEqual(['Sin aviso', 'El día antes (9:00)', 'Una semana antes (9:00)']);
    expect(avisosDisponibles(false).map((o) => o.valor)).toEqual([null, 0, 60, 1440]);
    expect(avisosDisponibles(true).map((o) => o.valor)).toEqual([null, 900, 9540]);
  });
  it('un valor guardado que no está en la lista se conserva como opción', () => {
    expect(avisosDisponibles(false, 30).at(-1)).toEqual({ valor: 30, etiqueta: '30 min antes' });
    expect(avisosDisponibles(false, 120).at(-1)).toEqual({ valor: 120, etiqueta: '2 horas antes' });
    expect(avisosDisponibles(false, 60)).toHaveLength(4);
  });
  it('al cambiar de modo, «un día antes» se convierte en «el día antes» y lo demás se quita', () => {
    expect(ajustarAviso(1440, true)).toBe(900);
    expect(ajustarAviso(900, false)).toBe(1440);
    expect(ajustarAviso(60, true)).toBeNull();
    expect(ajustarAviso(9540, false)).toBeNull();
    expect(ajustarAviso(9540, true)).toBe(9540);
    expect(ajustarAviso(null, true)).toBeNull();
    expect(conTodoElDia({ ...base, aviso: 60 }, true)).toMatchObject({ todoElDia: true, aviso: null });
  });
  it('texto del aviso', () => {
    expect(textoAviso(60, false, '21:30')).toBe('Te avisaremos a las 20:30');
    expect(textoAviso(0, false, '21:30')).toBe('Te avisaremos a las 21:30');
    expect(textoAviso(1440, false, '21:30')).toBe('Te avisaremos el día antes, a las 21:30');
    expect(textoAviso(900, true, null)).toBe('Te avisaremos el día antes, a las 9:00');
    expect(textoAviso(9540, true, null)).toBe('Te avisaremos una semana antes, a las 9:00');
    expect(textoAviso(60, false, '00:30')).toBe('Te avisaremos el día antes, a las 23:30');
  });
});

describe('secreto', () => {
  it('al activarlo «¿Quién va?» pasa a «Solo tú»; al quitarlo vuelve a lo de antes', () => {
    const a = conSecreto(base, true, 'm1', 'both');
    expect(a).toMatchObject({ secreto: true, asistentes: 'm1' });
    expect(conSecreto(a, false, 'm1', 'both')).toMatchObject({ secreto: false, asistentes: 'both' });
  });
  it('si se cambió a mano mientras era secreto, se respeta', () => {
    const a = { ...conSecreto(base, true, 'm1', 'both'), asistentes: 'both' as const };
    expect(conSecreto(a, false, 'm1', 'both').asistentes).toBe('both');
  });
});

describe('preguntarTrasPresupuesto', () => {
  it('se activa solo al poner un importe', () => {
    expect(preguntarTrasPresupuesto('', '6', false, false)).toBe(true);
    expect(preguntarTrasPresupuesto('6', '60', true, false)).toBe(true);
  });
  it('si se ha tocado el interruptor, no se vuelve a activar solo', () => {
    expect(preguntarTrasPresupuesto('', '6', false, true)).toBe(false);
    expect(preguntarTrasPresupuesto('6', '60', false, true)).toBe(false);
  });
  it('se quita al vaciar el presupuesto o si no es un importe', () => {
    expect(preguntarTrasPresupuesto('60', '', true, false)).toBe(false);
    expect(preguntarTrasPresupuesto('60', 'abc', true, true)).toBe(false);
  });
});

describe('validar', () => {
  it('título vacío y presupuesto ilegible', () => {
    const e = validar({ ...base, titulo: ' ', presupuesto: '1,2,3' }, '2026-11-17');
    expect(e.titulo).toMatch(/título/);
    expect(e.presupuesto).toMatch(/importe/);
    expect(hayErrores(e)).toBe(true);
  });
  it('una fecha pasada vale: se puede apuntar algo que ya pasó o un viaje que ya empezó', () => {
    expect(hayErrores(validar({ ...base, fecha: '2026-03-15' }, '2026-11-17'))).toBe(false);
  });
  it('formulario correcto', () => {
    expect(hayErrores(validar(base, '2026-11-17'))).toBe(false);
  });
});

describe('textos', () => {
  it('quién va', () => {
    expect(textoAsistentes('both', 'm1', 'Meri')).toBe('Vais los dos');
    expect(textoAsistentes('m1', 'm1', 'Meri')).toBe('Solo vas tú');
    expect(textoAsistentes('m2', 'm1', 'Meri')).toBe('Solo va Meri');
  });
  it('cuándo', () => {
    expect(textoCuando('2026-11-19', '21:30', false, '2026-11-19')).toBe('Hoy, jueves 19 · 21:30');
    expect(textoCuando('2026-11-20', '21:30', false, '2026-11-19')).toBe('Mañana, viernes 20 · 21:30');
    expect(textoCuando('2026-11-22', null, true, '2026-11-19')).toBe('Domingo 22 nov · todo el día');
    expect(textoCuando('2027-03-15', null, true, '2026-11-19')).toBe('Lunes 15 mar 2027 · todo el día');
  });
  it('serie y hora', () => {
    expect(textoSerie('yearly')).toBe('Se repite cada año');
    expect(textoSerie('none')).toBeNull();
    expect(horaCorta('21:30:00')).toBe('21:30');
    expect(horaCorta(null)).toBeNull();
  });
});

describe('categoría y formulario nuevo', () => {
  it('por defecto «Otros», un día y sin cumpleaños', () => {
    expect(base).toMatchObject({ categoria: 'other', variosDias: false, anioNacimiento: '', dia: 21, mes: 11, fechaFin: '2026-11-22' });
    expect(aDatos(base, 'm1')).toMatchObject({ category: 'other', end_date: null, birth_year: null });
  });
  it('el filtro Viajes abre un viaje de varios días; Comer fuera y Ocio, su categoría', () => {
    const viaje = formularioNuevo('2026-12-03', 'trip');
    expect(viaje).toMatchObject({ categoria: 'trip', variosDias: true, todoElDia: true, fechaFin: '2026-12-04' });
    expect(formularioNuevo('2026-12-03', 'eating_out')).toMatchObject({ categoria: 'eating_out', variosDias: false });
    expect(formularioNuevo('2026-12-03', 'leisure').categoria).toBe('leisure');
  });
  it('elegir Viaje activa «Varios días» solo si no se ha tocado; las otras no lo quitan', () => {
    expect(conCategoria(base, 'trip', false).variosDias).toBe(true);
    expect(conCategoria(base, 'trip', true).variosDias).toBe(false);
    const viaje = conCategoria(base, 'trip', false);
    expect(conCategoria(viaje, 'leisure', false)).toMatchObject({ categoria: 'leisure', variosDias: true });
  });
  it('ida y vuelta de la categoría', () => {
    const e: Evento = { ...fila, recurrence: 'none', category: 'eating_out' };
    expect(soloCambios(e, aDatos(deEvento(e), 'm1'))).toEqual({});
    expect(soloCambios(e, aDatos({ ...deEvento(e), categoria: 'leisure' }, 'm1'))).toEqual({ category: 'leisure' });
  });
});

describe('varios días', () => {
  const viaje = (extra: Partial<Formulario> = {}): Formulario => ({
    ...conVariosDias({ ...base, fecha: '2026-12-14' }, true),
    fechaFin: '2026-12-18',
    ...extra,
  });

  it('activarlo: todo el día, sin hora, aviso de todo el día y «Hasta» = Desde + 1', () => {
    const f = conVariosDias({ ...base, fecha: '2026-12-14', aviso: 1440, todoElDia: false }, true);
    expect(f).toMatchObject({ variosDias: true, todoElDia: true, fechaFin: '2026-12-15', aviso: 900 });
    expect(aDatos(f, 'm1')).toMatchObject({ all_day: true, start_time: null, end_date: '2026-12-15' });
  });
  it('envía end_date y todo el día; un solo día manda end_date null (nunca igual a la fecha)', () => {
    expect(aDatos(viaje(), 'm1')).toMatchObject({ start_date: '2026-12-14', end_date: '2026-12-18', all_day: true, start_time: null });
    expect(aDatos(viaje({ variosDias: false }), 'm1')).toMatchObject({ end_date: null });
    expect(aDatos(viaje({ fechaFin: '2026-12-14' }), 'm1').end_date).toBeNull();
  });
  it('duración inclusive: del 14 al 16 son 3 días', () => {
    expect(duracionDias(viaje({ fechaFin: '2026-12-16' }))).toBe(3);
    expect(duracionDias(viaje({ variosDias: false }))).toBe(1);
  });
  it('como mucho 31 días: 31 vale, 32 no', () => {
    expect(validar(viaje({ fechaFin: '2027-01-13' }), '2026-12-01').fecha).toBeNull(); // 14 dic + 30 = 13 ene → 31 días
    expect(validar(viaje({ fechaFin: '2027-01-14' }), '2026-12-01').fecha).toBe('Como mucho 31 días.');
  });
  it('«Hasta» tiene que ser posterior a «Desde»', () => {
    expect(validar(viaje({ fechaFin: '2026-12-14' }), '2026-12-01').fecha).toMatch(/posterior/);
    // Con «Varios días» apagado, la fecha de fin no cuenta.
    expect(validar(viaje({ variosDias: false, fechaFin: '2026-12-01' }), '2026-12-01').fecha).toBeNull();
  });
  it('repetición: semanal hasta 7 días, mensual hasta 28, anual siempre', () => {
    expect(repeticionesPermitidas(1)).toEqual(['none', 'weekly', 'monthly', 'yearly']);
    expect(repeticionesPermitidas(7)).toEqual(['none', 'weekly', 'monthly', 'yearly']);
    expect(repeticionesPermitidas(8)).toEqual(['none', 'monthly', 'yearly']);
    expect(repeticionesPermitidas(28)).toEqual(['none', 'monthly', 'yearly']);
    expect(repeticionesPermitidas(29)).toEqual(['none', 'yearly']);
    expect(repeticionesPermitidas(31)).toEqual(['none', 'yearly']);
  });
  it('un semanal de 8 días no está permitido: error y motivo legible', () => {
    const f = viaje({ fechaFin: '2026-12-21', repeticion: 'weekly' }); // 14 → 21 = 8 días
    expect(duracionDias(f)).toBe(8);
    expect(validar(f, '2026-12-01').repeticion).toBe('Dura demasiado para repetirse cada semana');
    expect(motivoRepeticion('weekly', 7)).toBeNull();
    expect(motivoRepeticion('monthly', 29)).toBe('Dura demasiado para repetirse cada mes');
    expect(validar(viaje({ fechaFin: '2026-12-20', repeticion: 'weekly' }), '2026-12-01').repeticion).toBeNull();
  });
  it('al activarlo o alargarlo, la repetición NO se cambia sola: validar bloquea con el motivo', () => {
    // Una serie semanal editada hasta 12 días no se convierte en un evento suelto sin avisar.
    const semanal = { ...base, fecha: '2026-12-14', repeticion: 'weekly' as const, fechaFin: '2026-12-25' };
    const largo = conVariosDias(semanal, true);
    expect(largo.repeticion).toBe('weekly');
    expect(validar(largo, '2026-12-01').repeticion).toBe('Dura demasiado para repetirse cada semana');
    expect(hayErrores(validar(largo, '2026-12-01'))).toBe(true);
    const corto = conVariosDias({ ...base, fecha: '2026-12-14', repeticion: 'weekly' }, true);
    expect(corto.repeticion).toBe('weekly');
    expect(validar(corto, '2026-12-01').repeticion).toBeNull();
    const alargado = conFechaFin(corto, '2026-12-30');
    expect(alargado.repeticion).toBe('weekly');
    expect(validar(alargado, '2026-12-01').repeticion).toBe('Dura demasiado para repetirse cada semana');
    expect(conFechaFin(alargado, '2026-12-17').repeticion).toBe('weekly');
    expect(validar(conFechaFin(alargado, '2026-12-17'), '2026-12-01').repeticion).toBeNull();
  });
  it('cambiar «Desde» mueve «Hasta» los mismos días', () => {
    const f = viaje();
    expect(conFecha(f, '2026-12-20')).toMatchObject({ fecha: '2026-12-20', fechaFin: '2026-12-24' });
    expect(conFecha(viaje({ variosDias: false }), '2026-12-20').fecha).toBe('2026-12-20');
  });
  it('editar un evento de varios días: ida y vuelta sin cambios; de 1 a varios cambia end_date y all_day', () => {
    const e: Evento = { ...fila, recurrence: 'none', start_date: '2026-12-14', end_date: '2026-12-18', category: 'trip', reminder_minutes: null };
    expect(deEvento(e)).toMatchObject({ variosDias: true, fechaFin: '2026-12-18', categoria: 'trip' });
    expect(soloCambios(e, aDatos(deEvento(e), 'm1'))).toEqual({});
    const uno: Evento = { ...e, end_date: null };
    expect(soloCambios(uno, aDatos({ ...deEvento(uno), variosDias: true, fechaFin: '2026-12-16' }, 'm1'))).toEqual({ end_date: '2026-12-16' });
  });
  it('«¿Quién pagó?» se permite con varios días (si no se repite)', () => {
    expect(aDatos(viaje({ presupuesto: '800', preguntarQuienPago: true }), 'm1')).toMatchObject({ budget_cents: 80000, ask_who_paid: true });
  });
  it('textos: «Del vie 14 al dom 16 nov · 3 días», en curso y al cruzar de mes', () => {
    expect(textoVariosDias('2026-11-13', '2026-11-15')).toBe('Del vie 13 al dom 15 nov · 3 días');
    expect(textoVariosDias('2026-10-28', '2026-11-03')).toBe('Del mié 28 oct al mar 3 nov · 7 días');
    expect(textoEnCurso('2026-11-14', '2026-11-16', '2026-11-15')).toBe('Hasta el lunes 16 · día 2 de 3');
    expect(textoEnCurso('2026-11-14', '2026-11-16', '2026-11-13')).toBeNull();
    expect(textoEnCurso('2026-11-14', '2026-11-16', '2026-11-17')).toBeNull();
  });
});

describe('cumpleaños', () => {
  const yo = 'm1' as const;
  const cumple = (extra: Partial<Formulario> = {}): Formulario => ({
    ...formularioNuevo('2026-03-15', 'birthday', yo),
    titulo: ' Carmen ',
    ...extra,
  });

  it('el formulario nuevo: de parte tuya, aviso el día antes y día y mes de la fecha elegida', () => {
    expect(cumple()).toMatchObject({ categoria: 'birthday', asistentes: 'm1', aviso: 900, dia: 15, mes: 3, secreto: false });
    expect(formularioNuevo('2026-03-15', 'birthday', 'm2').asistentes).toBe('m2');
  });
  it('se guarda con el año ancla 2000, cada año, todo el día, sin presupuesto ni «¿Quién pagó?»', () => {
    expect(aDatosNuevo(cumple({ anioNacimiento: '1966', asistentes: 'm2' }), yo)).toEqual({
      place_id: null,
      title: 'Carmen',
      start_date: '2000-03-15',
      start_time: null,
      end_date: null,
      all_day: true,
      recurrence: 'yearly',
      attendees: 'm2',
      budget_cents: null,
      ask_who_paid: false,
      reminder_minutes: 900,
      notes: null,
      category: 'birthday',
      birth_year: 1966,
      is_secret: false,
    });
  });
  it('nunca es secreto ni lleva presupuesto aunque el formulario lo traiga', () => {
    const d = aDatosNuevo(cumple({ secreto: true, presupuesto: '60', preguntarQuienPago: true, variosDias: true, fechaFin: '2026-03-20' }), yo);
    expect(d).toMatchObject({ is_secret: false, budget_cents: null, ask_who_paid: false, end_date: null, recurrence: 'yearly' });
  });
  it('sin año de nacimiento: birth_year null; a medias, también', () => {
    expect(aDatos(cumple(), yo).birth_year).toBeNull();
    expect(aDatos(cumple({ anioNacimiento: '19' }), yo).birth_year).toBeNull();
  });
  it('29 de febrero: se guarda 2000-02-29', () => {
    expect(fechaCumple(2, 29)).toBe('2000-02-29');
    expect(aDatos(cumple({ dia: 29, mes: 2 }), yo).start_date).toBe('2000-02-29');
  });
  it('día y mes: un día que no existe en el mes pasa al último (31 → 30 en abril); febrero llega a 29', () => {
    expect(conDiaMes(cumple({ dia: 31, mes: 3 }), 31, 4)).toMatchObject({ dia: 30, mes: 4 });
    expect(conDiaMes(cumple(), 31, 2)).toMatchObject({ dia: 29, mes: 2 });
    expect(conDiaMes(cumple(), 15, 12)).toMatchObject({ dia: 15, mes: 12 });
  });
  it('validación: nombre obligatorio y año entre 1900 y este año', () => {
    expect(validar(cumple({ titulo: ' ' }), '2026-11-18').titulo).toMatch(/quién cumple/);
    expect(validar(cumple({ anioNacimiento: '' }), '2026-11-18').anioNacimiento).toBeNull();
    expect(validar(cumple({ anioNacimiento: '1966' }), '2026-11-18').anioNacimiento).toBeNull();
    expect(validar(cumple({ anioNacimiento: '2026' }), '2026-11-18').anioNacimiento).toBeNull();
    expect(validar(cumple({ anioNacimiento: '1899' }), '2026-11-18').anioNacimiento).toMatch(/entre 1900 y 2026/);
    expect(validar(cumple({ anioNacimiento: '2027' }), '2026-11-18').anioNacimiento).toMatch(/entre 1900 y 2026/);
    expect(validar(cumple({ anioNacimiento: '196' }), '2026-11-18').anioNacimiento).toMatch(/4 cifras/);
  });
  it('29 de febrero con un año no bisiesto: «Ese año no tuvo 29 de febrero»', () => {
    const f = cumple({ dia: 29, mes: 2 });
    expect(validar({ ...f, anioNacimiento: '1997' }, '2026-11-18').anioNacimiento).toBe('Ese año no tuvo 29 de febrero.');
    expect(validar({ ...f, anioNacimiento: '1996' }, '2026-11-18').anioNacimiento).toBeNull();
    expect(validar({ ...f, anioNacimiento: '1900' }, '2026-11-18').anioNacimiento).toBe('Ese año no tuvo 29 de febrero.'); // 1900 no fue bisiesto
  });
  it('un cumpleaños no valida presupuesto, repetición ni fechas de varios días', () => {
    const e = validar(cumple({ presupuesto: 'abc', repeticion: 'weekly', variosDias: true, fechaFin: '2030-01-01' }), '2026-11-18');
    expect(e).toEqual({ titulo: null, presupuesto: null, fecha: null, anioNacimiento: null, repeticion: null });
  });
  it('cambiar de tipo conserva título y notas; de cumpleaños a evento vuelve a lo normal', () => {
    const e = conTipo({ ...base, notas: 'regalo', fecha: '2026-03-15' }, 'cumple', yo);
    expect(e).toMatchObject({ categoria: 'birthday', titulo: base.titulo, notas: 'regalo', dia: 15, mes: 3, aviso: 900 });
    expect(conTipo(e, 'evento', yo)).toMatchObject({ categoria: 'other', asistentes: 'both', aviso: null, repeticion: 'none', notas: 'regalo' });
  });
  it('editar un cumpleaños: ida y vuelta sin cambios', () => {
    const e: Evento = { ...fila, title: 'Carmen', start_date: '2000-03-15', category: 'birthday', birth_year: 1966, attendees: 'm2' };
    expect(deEvento(e)).toMatchObject({ categoria: 'birthday', dia: 15, mes: 3, anioNacimiento: '1966', asistentes: 'm2' });
    expect(soloCambios(e, aDatos(deEvento(e), 'm1'))).toEqual({});
    expect(soloCambios(e, aDatos({ ...deEvento(e), anioNacimiento: '' }, 'm1'))).toEqual({ birth_year: null });
  });
  it('textos: título, edad y «Domingo 15 mar · cumple 60»', () => {
    expect(tituloCumple('Carmen')).toBe('Cumple de Carmen');
    expect(textoEdad(1966, '2026-03-15')).toBe('Cumple 60');
    expect(textoEdad(null, '2026-03-15')).toBeNull();
    expect(textoCuandoCumple('2026-03-15', 1966, '2026-01-10')).toBe('Domingo 15 mar · cumple 60');
    expect(textoCuandoCumple('2026-03-15', null, '2026-01-10')).toBe('Domingo 15 mar');
    expect(textoCuandoCumple('2026-03-15', 1966, '2026-03-15')).toBe('Hoy, domingo 15 · cumple 60');
  });
  it('ayuda en vivo: «Cumplirá 61 el 15 mar 2027»', () => {
    expect(textoCumplira(cumple({ anioNacimiento: '1966' }), '2026-11-18')).toBe('Cumplirá 61 el 15 mar 2027');
    expect(textoCumplira(cumple({ anioNacimiento: '1966' }), '2026-03-15')).toBe('Cumple 60 hoy');
    expect(textoCumplira(cumple({ anioNacimiento: '' }), '2026-11-18')).toBeNull();
    // 29 de febrero: el 28 los años no bisiestos.
    expect(textoCumplira(cumple({ dia: 29, mes: 2, anioNacimiento: '1996' }), '2026-11-18')).toBe('Cumplirá 31 el 28 feb 2027');
    expect(textoCumplira(cumple({ dia: 29, mes: 2, anioNacimiento: '1997' }), '2026-11-18')).toBeNull();
  });
});

describe('sitio del Mapa (place_id)', () => {
  it('el formulario nuevo lo trae y aDatos lo envía', () => {
    const f = { ...formularioNuevo('2026-11-21', 'eating_out', 'm1', 's1'), titulo: 'Cena' };
    expect(f.sitioId).toBe('s1');
    expect(aDatos(f, 'm1').place_id).toBe('s1');
    expect(aDatos({ ...f, sitioId: null }, 'm1').place_id).toBeNull();
  });
  it('un cumpleaños nunca lleva sitio', () => {
    const f = { ...formularioNuevo('2026-11-21', 'birthday', 'm1', 's1'), titulo: 'Marta' };
    expect(aDatos(f, 'm1').place_id).toBeNull();
  });
  it('al editar parte del sitio guardado y soloCambios detecta quitarlo', () => {
    const e = { ...fila, place_id: 's1' };
    expect(deEvento(e).sitioId).toBe('s1');
    expect(soloCambios(e, { place_id: null })).toEqual({ place_id: null });
  });
});
