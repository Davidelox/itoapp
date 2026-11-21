import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HojaDiaMes } from '@/components/calendario/HojaDiaMes';
import { SelectorHora } from '@/components/calendario/SelectorHora';
import { Chip, FilaChips, Grupo, Interruptor } from '@/components/gastos/Controles';
import { CampoSitio } from '@/components/mapa/CampoSitio';
import { EmojiIcono } from '@/components/mapa/EmojiIcono';
import { BotonFecha, SelectorFecha } from '@/components/gastos/SelectorFecha';
import { BotonNudo } from '@/components/hilo/BotonNudo';
import { BotonPrincipal } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { Segmentado } from '@/components/onboarding/OpcionRadio';
import { colors, fonts, radius } from '@/constants/theme';
import { crearEvento, editarEvento } from '@/lib/calendario/consultas';
import { diaDelEventoNuevo, paramsAlCalendario } from '@/lib/calendario/destino';
import {
  type Asistentes,
  CATEGORIAS_FORMULARIO,
  type CategoriaEvento,
  type Evento,
  type Formulario,
  MAX_DIAS_VARIOS,
  MAX_NOTA_RESERVA,
  MAX_TITULO,
  REPETICIONES,
  SIN_ERRORES,
  aDatos,
  aDatosNuevo,
  aDatosPlan,
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
  formularioNuevo,
  hayErrores,
  motivoRepeticion,
  preguntarTrasPresupuesto,
  textoCumplira,
  textoDuracion,
  validar,
} from '@/lib/calendario/evento';
import { vaAlEvento } from '@/lib/calendario/quienPago';
import { diasEntre, sumarDias } from '@/lib/calendario/rejilla';
import { textoRepeticion } from '@/lib/calendario/repeticion';
import { leerEuros } from '@/lib/dinero/importe';
import { usePresupuestos } from '@/lib/ajustes/presupuestos';
import { ErrorGasto, soloCambios } from '@/lib/gastos/consultas';
import { MESES, deISO, fechaCorta, fechaLarga, hoyISO } from '@/lib/gastos/fechas';
import { personas } from '@/lib/gastos/personas';
import { useInvalidarGastos } from '@/lib/gastos/useGastos';
import type { Pareja } from '@/lib/pareja/EstadoProvider';
import type { Plan } from '@/lib/planificador/tipos';
import { useInvalidarPlanificador } from '@/lib/planificador/usePlanificador';

const PAUSA_NUDO_MS = 900;

/** Qué se crea: un evento, un cumpleaños o un pago (este último abre el formulario de Pagos recurrentes). */
export type TipoFormulario = 'evento' | 'cumple' | 'pago';

type Props = {
  pareja: Pareja;
  /** Con un evento, el formulario edita (toda la serie si se repite); sin él, crea uno nuevo. */
  inicial?: Evento;
  /** Al crear: fecha de partida (la del día seleccionado en el calendario, también si es pasada). */
  fechaInicial?: string;
  /** Al crear: el tipo con el que se abre (lo sugiere el filtro del calendario). */
  tipoInicial?: TipoFormulario;
  /** Al crear un evento: la categoría con la que se abre (Viajes, Comer fuera u Ocio en el filtro). */
  categoriaInicial?: CategoriaEvento;
  /** Al crear un evento: el sitio del Mapa ya elegido («Planear aquí» en la ficha). */
  sitioInicial?: string | null;
  /**
   * Elemento del itinerario de este plan (modo plan): la fecha se limita a las del plan, no hay secreto, repetición, varios
   * días ni cumpleaños, y `plan_id` se envía solo al crear (cambiarlo en uno creado da TW069).
   */
  plan?: Pick<Plan, 'id' | 'name' | 'icon' | 'start_date' | 'end_date'>;
  alGuardarEdicion?: (enCurso: boolean) => void;
};

/** Nuevo o editar evento y cumpleaños (mockup NuevoEvento, docs/plan-calendario.md §2 y docs/plan-calendario-v2.md §2.4). */
export function FormularioEvento({ pareja, inicial, fechaInicial, tipoInicial, categoriaInicial, sitioInicial, plan, alGuardarEdicion }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const invalidarGastos = useInvalidarGastos();
  const invalidarPlan = useInvalidarPlanificador();
  // Un elemento del plan toca el itinerario, el calendario y el mapa (su sitio entra en la colección del plan).
  const invalidar = plan ? invalidarPlan : invalidarGastos;
  const p = personas(pareja);
  const yo = p.yo.slot;
  const editando = !!inicial;
  const hoy = hoyISO();

  const [tipo, setTipo] = useState<TipoFormulario>(() => (inicial ? (inicial.category === 'birthday' ? 'cumple' : 'evento') : (tipoInicial ?? 'evento')));
  const [f, setF] = useState<Formulario>(() =>
    inicial
      ? deEvento(inicial)
      : formularioNuevo(fechaInicial ?? hoy, tipoInicial === 'cumple' ? 'birthday' : (categoriaInicial ?? 'other'), yo, sitioInicial ?? null),
  );
  // Si se ha tocado «Varios días», elegir Viaje ya no lo activa solo.
  const [variosTocado, setVariosTocado] = useState(editando || !!plan);
  const [diaMesAbierto, setDiaMesAbierto] = useState(false);
  const cambiar = (parcial: Partial<Formulario>) => setF((x) => ({ ...x, ...parcial }));
  // Lo que había en «¿Quién va?» antes de activar «Evento secreto», para volver a ello al desactivarlo.
  const [asistentesAntes, setAsistentesAntes] = useState<Asistentes>('both');
  // Si se ha tocado el interruptor de «¿Quién pagó?», ya no se activa solo al poner un presupuesto.
  const [preguntarTocado, setPreguntarTocado] = useState(editando);
  const [error, setError] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);
  // Id del evento nuevo fijado al abrir: un reintento tras un fallo de red no lo duplica.
  const [idNuevo] = useState(() => Crypto.randomUUID());

  const tienePareja = !!p.otra;
  const esCumple = tipo === 'cumple';
  const presupuestos = usePresupuestos();
  // Con «Mostrar presupuestos» apagado el interruptor de «¿Quién pagó?» no depende de ningún presupuesto.
  const conPresupuesto = leerEuros(f.presupuesto) !== null || !presupuestos;
  const repite = f.repeticion !== 'none';
  const duracion = duracionDias(f);
  const errores = validar(f, hoy);
  const visibles = intentado ? errores : SIN_ERRORES;
  // Repeticiones que no caben en un evento de varios días: salen desactivadas, con el motivo.
  const sinRepeticion = REPETICIONES.map((r) => ({ valor: r.valor, motivo: motivoRepeticion(r.valor, duracion) })).filter((r) => r.motivo);
  const cambiarTipo = (t: TipoFormulario) => {
    setTipo(t);
    if (t === 'cumple' && f.categoria !== 'birthday') setF((x) => conTipo(x, 'cumple', yo));
    if (t === 'evento' && f.categoria === 'birthday') setF((x) => conTipo(x, 'evento', yo));
  };

  const ponerSecreto = (v: boolean) => {
    if (v) setAsistentesAntes(f.asistentes);
    setF((x) => conSecreto(x, v, yo, asistentesAntes));
  };
  const ponerPresupuesto = (texto: string) => {
    const t = texto.replace(/[^0-9.,]/g, '');
    setF((x) => ({ ...x, presupuesto: t, preguntarQuienPago: preguntarTrasPresupuesto(x.presupuesto, t, x.preguntarQuienPago, preguntarTocado) }));
  };

  const guardar = async () => {
    setIntentado(true);
    if (hayErrores(errores)) {
      // El botón dice «No se ha podido guardar»; aquí, el porqué (el primer error).
      setError(Object.values(errores).find((e) => e !== null) ?? null);
      throw new Error('incompleto');
    }
    setError(null);
    try {
      if (inicial) {
        // Solo lo que ha cambiado; el control de versión avisa si tu pareja lo tocó mientras tanto.
        const cambios = soloCambios(inicial, aDatos(f, yo, !presupuestos));
        if (Object.keys(cambios).length > 0) {
          alGuardarEdicion?.(true);
          await editarEvento(inicial.id, inicial.version, cambios, p.nombrePareja);
        }
      } else {
        await crearEvento(idNuevo, pareja.coupleId, plan ? aDatosPlan(f, yo, plan.id) : aDatosNuevo(f, yo, !presupuestos));
      }
    } catch (e) {
      // El sitio ya no está (borrado o privado de tu pareja): se quita la selección.
      if (e instanceof ErrorGasto && e.codigo === 'TW064') cambiar({ sitioId: null });
      // La reserva enlazada de un plan sube la versión del evento al marcarse: se recarga para que salga el aviso con «Recargar».
      if (e instanceof ErrorGasto && e.codigo === 'version') invalidar();
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido guardar. Inténtalo de nuevo.');
      alGuardarEdicion?.(false);
      throw e;
    }
  };

  const alTerminar = () => {
    invalidar();
    const id = inicial?.id ?? idNuevo;
    setTimeout(() => {
      if (editando) router.back();
      // Un elemento nuevo del plan vuelve a su itinerario.
      else if (plan) router.dismissTo({ pathname: '/planificador/[id]', params: { id: plan.id } });
      // Un evento nuevo lleva al calendario, con el día de su inicio seleccionado y el evento resaltado. `dismissTo`
      // cierra el formulario (y, si se vino de «Crear pago», también el del pago) sin apilar otro calendario.
      else router.dismissTo({ pathname: '/calendario', params: paramsAlCalendario(diaDelEventoNuevo(f, esCumple, hoy), id) });
    }, PAUSA_NUDO_MS);
  };

  // Los pagos no se crean aquí: «Crear pago» abre el formulario de Pagos recurrentes con el día elegido
  // (un pago no empieza en el pasado: si el día era pasado, hoy).
  const crearPago = () => router.push({ pathname: '/gastos/recurrente/nuevo', params: { dia: f.fecha < hoy ? hoy : f.fecha, origen: 'calendario' } });

  const avisos = avisosDisponibles(f.todoElDia || esCumple, f.aviso);
  const quienVa: { valor: Asistentes; etiqueta: string }[] = [
    { valor: 'both', etiqueta: 'Los dos' },
    { valor: yo, etiqueta: 'Solo tú' },
    { valor: yo === 'm1' ? 'm2' : 'm1', etiqueta: `Solo ${p.nombrePareja}` },
  ];
  const deParteDe: { valor: Asistentes; etiqueta: string }[] = [
    { valor: yo, etiqueta: 'Tuya' },
    { valor: yo === 'm1' ? 'm2' : 'm1', etiqueta: `De ${p.nombrePareja}` },
    { valor: 'both', etiqueta: 'De los dos' },
  ];
  const ayudaCumple = esCumple ? textoCumplira(f, hoy) : null;

  return (
    <View style={styles.raiz}>
      <View style={[styles.cabecera, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={() => router.back()} style={styles.cerrar}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.titulo}>
          {editando ? (esCumple ? 'Editar cumpleaños' : 'Editar evento') : esCumple ? 'Nuevo cumpleaños' : 'Nuevo evento'}
        </Text>
        <View style={styles.cerrarHueco} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.contenido}
      >
        {plan ? (
          <View style={styles.plan} accessible accessibilityLabel={`Plan: ${plan.name}`}>
            <EmojiIcono emoji={plan.icon} size={20} />
            <Text style={styles.planTexto} numberOfLines={1}>
              Plan: {plan.name}
            </Text>
          </View>
        ) : null}

        {!editando && !plan ? (
          <Grupo etiqueta="Tipo">
            <Segmentado
              etiqueta="Tipo"
              opciones={[
                { valor: 'evento', etiqueta: 'Evento' },
                { valor: 'cumple', etiqueta: 'Cumpleaños' },
                { valor: 'pago', etiqueta: 'Pago' },
              ]}
              valor={tipo}
              onCambiar={cambiarTipo}
            />
            {tipo === 'pago' ? <Text style={styles.ayuda}>Los pagos se crean en Pagos recurrentes.</Text> : null}
          </Grupo>
        ) : null}

        {tipo !== 'pago' ? (
          <Grupo etiqueta={esCumple ? '¿Quién cumple?' : 'Título'}>
            <TextInput
              accessibilityLabel={esCumple ? '¿Quién cumple?' : 'Título'}
              value={f.titulo}
              onChangeText={(t) => cambiar({ titulo: t })}
              maxLength={MAX_TITULO}
              placeholder={esCumple ? 'Carmen, la madre de Meri…' : 'Cena, cine, cita, aniversario…'}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="sentences"
              returnKeyType="done"
              style={styles.campo}
            />
            <MensajeError texto={visibles.titulo} />
          </Grupo>
        ) : null}

        {tipo === 'evento' && !editando && !plan ? (
          <Interruptor
            titulo="Evento secreto"
            ayuda="Solo lo verás tú. Ideal para sorpresas"
            valor={f.secreto}
            onCambiar={ponerSecreto}
          />
        ) : null}

        {tipo === 'evento' ? (
          <Grupo etiqueta="Categoría" rol="radiogroup">
            <FilaChips>
              {CATEGORIAS_FORMULARIO.map((c) => (
                <Chip
                  key={c.valor}
                  rol="radio"
                  etiqueta={c.etiqueta}
                  icono={c.icono ?? undefined}
                  activo={f.categoria === c.valor}
                  onPress={() => setF((x) => conCategoria(x, c.valor, variosTocado))}
                />
              ))}
            </FilaChips>
          </Grupo>
        ) : null}

        {tipo === 'evento' ? <CampoSitio valor={f.sitioId} onCambiar={(sitioId) => cambiar({ sitioId })} compartido={!f.secreto} /> : null}

        {esCumple ? (
          <>
            <Grupo etiqueta="Día y mes">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Día y mes: ${f.dia} de ${MESES[f.mes - 1].toLowerCase()}`}
                accessibilityHint="Abre el selector de día y mes"
                onPress={() => setDiaMesAbierto(true)}
                style={styles.boton}
              >
                <Ionicons name="gift-outline" size={20} color={colors.icon} />
                <Text style={styles.botonTexto}>
                  {f.dia} de {MESES[f.mes - 1].toLowerCase()}
                </Text>
                <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
              </Pressable>
              <HojaDiaMes
                visible={diaMesAbierto}
                dia={f.dia}
                mes={f.mes}
                onCambiar={(dia, mes) => setF((x) => conDiaMes(x, dia, mes))}
                onCerrar={() => setDiaMesAbierto(false)}
              />
            </Grupo>

            <Grupo etiqueta="Año de nacimiento (opcional)">
              <TextInput
                accessibilityLabel="Año de nacimiento"
                value={f.anioNacimiento}
                onChangeText={(t) => cambiar({ anioNacimiento: t.replace(/[^0-9]/g, '').slice(0, 4) })}
                placeholder="1966"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={4}
                style={styles.campo}
              />
              {ayudaCumple && !visibles.anioNacimiento ? (
                <Text style={styles.ayuda} accessibilityLiveRegion="polite">
                  {ayudaCumple}
                </Text>
              ) : null}
              <MensajeError texto={visibles.anioNacimiento} />
            </Grupo>

            {tienePareja ? (
              <Grupo etiqueta="¿De parte de quién?" rol="radiogroup">
                <FilaChips>
                  {deParteDe.map((o) => (
                    <Chip key={o.valor} rol="radio" etiqueta={o.etiqueta} activo={f.asistentes === o.valor} onPress={() => cambiar({ asistentes: o.valor })} />
                  ))}
                </FilaChips>
              </Grupo>
            ) : null}
          </>
        ) : (
          <>
            {plan ? (
              <Grupo etiqueta="Día">
                <BotonFecha
                  valor={f.fecha}
                  texto={`${fechaCorta(f.fecha, deISO(hoy))} · Día ${diasEntre(plan.start_date, f.fecha) + 1}`}
                  etiqueta={`Día: ${fechaLarga(f.fecha, deISO(hoy))}, día ${diasEntre(plan.start_date, f.fecha) + 1} del plan`}
                  minimo={plan.start_date}
                  maximo={plan.end_date}
                  onCambiar={(fecha) => setF((x) => conFecha(x, fecha))}
                />
              </Grupo>
            ) : (
              <Grupo etiqueta={tipo === 'pago' ? 'Día del primer cobro' : f.variosDias ? 'Desde' : 'Fecha'} rol="radiogroup">
                <SelectorFecha valor={f.fecha} onCambiar={(fecha) => setF((x) => conFecha(x, fecha))} modo={tipo === 'pago' ? 'futuras' : 'todas'} />
              </Grupo>
            )}

            {tipo === 'evento' && !plan ? (
              <>
                <Interruptor
                  titulo="Varios días"
                  ayuda={f.variosDias ? 'De todo el día, hasta 31 días' : 'Un viaje, unas vacaciones…'}
                  valor={f.variosDias}
                  onCambiar={(v) => {
                    setVariosTocado(true);
                    setF((x) => conVariosDias(x, v));
                  }}
                />
                {f.variosDias ? (
                  <Grupo etiqueta="Hasta">
                    <BotonFecha
                      valor={f.fechaFin}
                      texto={`${fechaCorta(f.fechaFin, deISO(hoy))} · ${textoDuracion(duracion)}`}
                      etiqueta={`Hasta: ${fechaLarga(f.fechaFin, deISO(hoy))}, ${textoDuracion(duracion)}`}
                      minimo={sumarDias(f.fecha, 1)}
                      maximo={sumarDias(f.fecha, MAX_DIAS_VARIOS - 1)}
                      rangoDesde={f.fecha}
                      onCambiar={(fin) => setF((x) => conFechaFin(x, fin))}
                    />
                    <MensajeError texto={visibles.fecha} />
                  </Grupo>
                ) : null}
              </>
            ) : null}
          </>
        )}

        {tipo === 'evento' ? (
          <>
            {f.variosDias ? null : (
              <Grupo etiqueta="Hora">
                {f.todoElDia ? null : <SelectorHora valor={f.hora} onCambiar={(hora) => cambiar({ hora })} />}
                <Interruptor
                  titulo="Todo el día"
                  ayuda={f.todoElDia ? 'Sin hora' : 'Con hora de inicio'}
                  valor={f.todoElDia}
                  onCambiar={(v) => setF((x) => conTodoElDia(x, v))}
                />
              </Grupo>
            )}

            {plan ? null : (
              <Grupo etiqueta="Repetir" rol="radiogroup">
                <FilaChips>
                  {REPETICIONES.map((r) => {
                    const motivo = motivoRepeticion(r.valor, duracion);
                    return (
                      <Chip
                        key={r.valor}
                        rol="radio"
                        etiqueta={r.etiqueta}
                        activo={f.repeticion === r.valor}
                        deshabilitado={!!motivo}
                        pista={motivo ?? undefined}
                        onPress={() => cambiar({ repeticion: r.valor })}
                      />
                    );
                  })}
                </FilaChips>
                {sinRepeticion.length > 0 ? <Text style={styles.ayuda}>{sinRepeticion.map((r) => r.motivo).join('. ')}.</Text> : null}
                {/* Sin esperar al intento de guardar: la repetición elegida ya no cabe en la duración. */}
                <MensajeError texto={errores.repeticion} />
                {repite ? (
                  <Text style={styles.ayuda} accessibilityLiveRegion="polite">
                    {textoRepeticion(f.repeticion, f.fecha)}
                    {editando ? '. Al editar se cambia toda la serie.' : ''}
                  </Text>
                ) : null}
              </Grupo>
            )}

            {tienePareja ? (
              <Grupo etiqueta="¿Quién va?" rol="radiogroup">
                <FilaChips>
                  {quienVa.map((o) => (
                    <Chip key={o.valor} rol="radio" etiqueta={o.etiqueta} activo={f.asistentes === o.valor} onPress={() => cambiar({ asistentes: o.valor })} />
                  ))}
                </FilaChips>
              </Grupo>
            ) : null}

            <Grupo etiqueta={presupuestos ? 'Presupuesto (opcional)' : '¿Quién pagó?'}>
              {presupuestos ? (
              <View style={styles.importeFila}>
                <TextInput
                  accessibilityLabel="Presupuesto en euros"
                  value={f.presupuesto}
                  onChangeText={ponerPresupuesto}
                  placeholder="0,00"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  style={[styles.campo, styles.importe]}
                />
                <Text style={styles.euro}>€</Text>
              </View>
              ) : null}
              <MensajeError texto={visibles.presupuesto} />
              {repite || !vaAlEvento(f.asistentes, yo) ? null : (
                <Interruptor
                  titulo="Preguntar «¿Quién pagó?» al terminar"
                  ayuda={
                    conPresupuesto
                      ? 'Cuando pase, te preguntaremos quién pagó para guardar el gasto.'
                      : 'Pon un presupuesto para activarlo.'
                  }
                  valor={conPresupuesto && f.preguntarQuienPago}
                  deshabilitado={!conPresupuesto}
                  onCambiar={(v) => {
                    setPreguntarTocado(true);
                    cambiar({ preguntarQuienPago: v });
                  }}
                />
              )}
            </Grupo>
          </>
        ) : null}

        {tipo !== 'pago' ? (
          <>
            {tipo === 'evento' ? (
              <Grupo etiqueta="Reserva">
                <Interruptor
                  titulo="Reservado"
                  ayuda={f.reservado ? 'Ya está reservado' : 'Mesa, hotel, entradas…'}
                  valor={f.reservado}
                  onCambiar={(reservado) => cambiar({ reservado })}
                />
                {f.reservado ? (
                  <TextInput
                    accessibilityLabel="Nota de la reserva"
                    value={f.notaReserva}
                    onChangeText={(t) => cambiar({ notaReserva: t })}
                    maxLength={MAX_NOTA_RESERVA}
                    placeholder="A nombre de David, 21:30"
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="sentences"
                    returnKeyType="done"
                    style={styles.campo}
                  />
                ) : null}
              </Grupo>
            ) : null}

            <Grupo etiqueta="Aviso" rol="radiogroup">
              <FilaChips>
                {avisos.map((a) => (
                  <Chip key={a.etiqueta} rol="radio" etiqueta={a.etiqueta} activo={f.aviso === a.valor} onPress={() => cambiar({ aviso: a.valor })} />
                ))}
              </FilaChips>
              <Text style={styles.ayuda}>Te avisamos en el móvil. Elige qué avisos recibes en Ajustes.</Text>
            </Grupo>

            <Grupo etiqueta="Notas">
              <TextInput
                accessibilityLabel="Notas"
                value={f.notas}
                onChangeText={(t) => cambiar({ notas: t })}
                maxLength={1000}
                multiline
                placeholder={esCumple ? 'Ideas de regalo, talla…' : 'Reserva, qué llevar…'}
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="sentences"
                textAlignVertical="top"
                style={[styles.campo, styles.notas]}
              />
            </Grupo>
          </>
        ) : null}

        <MensajeError texto={error} />
      </ScrollView>

      <View style={[styles.pie, { paddingBottom: insets.bottom + 20 }]}>
        {tipo === 'pago' ? (
          <BotonPrincipal etiqueta="Crear pago" onPress={crearPago} />
        ) : (
          <BotonNudo
            label={editando ? 'Guardar cambios' : esCumple ? 'Guardar cumpleaños' : 'Guardar evento'}
            labelHecho="Guardado"
            labelError="No se ha podido guardar"
            onPress={guardar}
            onHecho={alTerminar}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colors.background },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  cerrar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cerrarHueco: { width: 44 },
  titulo: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  contenido: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, gap: 14 },
  campo: {
    height: 50,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.white,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
  },
  notas: { height: undefined, minHeight: 96, paddingTop: 14, paddingBottom: 14 },
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.white,
  },
  botonTexto: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  importeFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  importe: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 18 },
  euro: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text },
  ayuda: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  plan: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: colors.accentSoft },
  planTexto: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  pie: { backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 20, paddingTop: 16 },
});
