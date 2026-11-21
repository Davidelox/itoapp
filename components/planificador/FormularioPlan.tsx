import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SelectorIcono } from '@/components/SelectorIcono';
import { BarraPorcentaje, Chip, FilaChips, Grupo } from '@/components/gastos/Controles';
import { BotonFecha, SelectorFecha } from '@/components/gastos/SelectorFecha';
import { Hoja } from '@/components/gastos/Hoja';
import { BotonPrincipal, BotonSecundario } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { Segmentado } from '@/components/onboarding/OpcionRadio';
import { colors, fonts, personColors, radius } from '@/constants/theme';
import { sumarDias } from '@/lib/calendario/rejilla';
import { usePresupuestos } from '@/lib/ajustes/presupuestos';
import { ErrorGasto } from '@/lib/gastos/error';
import { deISO, fechaCorta, fechaLarga, hoyISO } from '@/lib/gastos/fechas';
import { personas } from '@/lib/gastos/personas';
import { ocultaProporcional, pctDeYo } from '@/lib/gastos/reparto';
import { useAjustesGastos } from '@/lib/gastos/useGastos';
import { ERROR_GENERICO } from '@/lib/mapa/error';
import type { Pareja } from '@/lib/pareja/EstadoProvider';
import { aplicarPrecarga, type Precarga } from '@/lib/planificador/precarga';
import { borrarIdea, sitioAlPlan } from '@/lib/planificador/consultasIdeas';
import { CasillasSugeridas } from '@/components/planificador/TareasSugeridas';
import { crearPlan, crearTareas, editarPlan, leerItinerario, moverPlan } from '@/lib/planificador/consultas';
import {
  avisoHanQuedadoFuera,
  avisoQuedaranFuera,
  desplazamiento,
  quedanFuera,
  separarFechas,
  textoMoverTodo,
} from '@/lib/planificador/itinerario';
import {
  EMOJIS_PLAN,
  MAX_DIAS_PLAN,
  MAX_NOMBRE_PLAN,
  MAX_NOTAS_PLAN,
  TIPOS_PLAN,
  cambiosPlan,
  conInicio,
  conTipo,
  duracionPlan,
  filaDePlan,
  formularioDePlan,
  formularioNuevo,
  hayErroresPlan,
  textoDuracion,
  validarPlan,
} from '@/lib/planificador/plan';
import { MAX_SUGERIDAS, PLANTILLAS, elegidas, filasSugeridas } from '@/lib/planificador/plantillas';
import type { Plan, TipoPlan } from '@/lib/planificador/tipos';
import type { ElementoItinerario } from '@/lib/planificador/itinerario';
import { useInvalidarPlanificador, useItinerario } from '@/lib/planificador/usePlanificador';

/**
 * Crear o editar un plan (mockup NuevoProyecto): tipo, icono, nombre, destino (viaje), fechas, presupuesto opcional (solo si «Mostrar presupuestos» está activo),
 * «¿Cómo se paga?» y notas. El pie con el botón queda fuera del scroll y no sube con el teclado.
 */
export function FormularioPlan({ pareja, plan, precarga = null }: { pareja: Pareja; plan?: Plan; /** Datos de una idea o de un plan duplicado (solo al crear). */ precarga?: Precarga | null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const invalidar = useInvalidarPlanificador();
  const itinerario = useItinerario();
  const presupuestos = usePresupuestos();
  const ajustes = useAjustesGastos().data;
  const p = personas(pareja);
  const yo = p.yo.slot;
  const editando = !!plan;
  const hoy = hoyISO();
  const [f, setF] = useState(() => (plan ? formularioDePlan(plan, yo) : aplicarPrecarga(formularioNuevo(hoy), precarga)));
  const [intentado, setIntentado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Elementos del itinerario del plan al cambiar sus fechas: abre «¿Mover también el itinerario?».
  const [aMover, setAMover] = useState<ElementoItinerario[] | null>(null);
  // Id fijado al abrir: reintentar tras un fallo de red no duplica el plan.
  const [id] = useState(() => plan?.id ?? Crypto.randomUUID());
  // Tareas sugeridas (solo al crear): desmarcadas por título e ids fijos para reintentar sin duplicar.
  const [desmarcadas, setDesmarcadas] = useState<string[]>([]);
  const [idsTareas] = useState(() => Array.from({ length: MAX_SUGERIDAS }, () => Crypto.randomUUID()));

  const errores = validarPlan(f);
  const dias = duracionPlan(f.inicio, f.fin);
  const unDia = f.tipo === 'celebration';
  const conBote = !!ajustes?.boteActivo || f.division === 'pot';
  const pctProporcionalM1 = ajustes?.pctProporcionalM1 ?? 50;
  const sinProporcional = ocultaProporcional(pctProporcionalM1, f.division === 'proportional');
  const pctProporcionalYo = pctDeYo(yo, pctProporcionalM1);

  const cerrar = () => (router.canGoBack() ? router.back() : router.replace('/planificador'));

  /** `desplazar`: null = aún no se ha preguntado; true = mover también el itinerario; false = solo las fechas del plan. */
  const guardar = async (desplazar: boolean | null) => {
    setIntentado(true);
    if (hayErroresPlan(errores)) return;
    setOcupado(true);
    setError(null);
    try {
      const fila = filaDePlan(f, yo);
      if (plan) {
        const cambios = cambiosPlan(filaDePlan(formularioDePlan(plan, yo), yo), fila);
        const { cambianFechas, resto } = separarFechas(cambios);
        if (cambianFechas && desplazar === null) {
          const propios = (itinerario.data ?? (await leerItinerario())).filter((e) => e.plan_id === plan.id);
          if (propios.length > 0) {
            setAMover(propios);
            return;
          }
        }
        // Las fechas van solo por `move_plan`; si además cambia otra cosa, primero el update (que da la versión nueva).
        let version = plan.version;
        if (Object.keys(resto).length > 0) version = await editarPlan(plan.id, version, resto, p.nombrePareja);
        let fuera = 0;
        if (cambianFechas) fuera = (await moverPlan(plan.id, fila.start_date, fila.end_date, version, desplazar === true)).outside;
        await invalidar();
        setAMover(null);
        cerrar();
        if (fuera > 0) Alert.alert(avisoHanQuedadoFuera(fuera));
      } else {
        await crearPlan(id, pareja.coupleId, fila);
        const sugeridas = elegidas(f.tipo, desmarcadas);
        if (sugeridas.length > 0) await crearTareas(pareja.coupleId, id, filasSugeridas(sugeridas, idsTareas));
        // De una idea: su sitio a la colección del plan y, al final, la idea se borra. Cada paso es idempotente: un fallo a mitad se reintenta sin duplicar.
        if (precarga?.idea) {
          if (precarga.sitio) await sitioAlPlan(id, pareja.coupleId, precarga.sitio);
          await borrarIdea(precarga.idea);
        }
        await invalidar();
        router.replace({ pathname: '/planificador/[id]', params: { id } });
      }
    } catch (e) {
      setAMover(null);
      setError(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
      // Versión vieja (`version` o TW068) o un update ya aplicado antes de fallar el movimiento: se recarga el plan.
      if (plan) await invalidar();
    } finally {
      setOcupado(false);
    }
  };

  const fueraSolo = aMover ? quedanFuera(aMover, f.inicio, f.fin, 0) : 0;
  const fueraTodo = aMover && plan ? quedanFuera(aMover, f.inicio, f.fin, desplazamiento(plan.start_date, f.inicio)) : 0;

  return (
    <KeyboardAvoidingView style={styles.raiz} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.cabecera, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={cerrar} style={styles.cerrar}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.titulo}>
          {editando ? 'Editar plan' : 'Nuevo plan'}
        </Text>
        <View style={styles.cerrarHueco} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.contenido}
      >
        <Grupo etiqueta="Tipo">
          <Segmentado<TipoPlan>
            etiqueta="Tipo de plan"
            opciones={TIPOS_PLAN.map((t) => ({ valor: t.valor, etiqueta: t.etiqueta }))}
            valor={f.tipo}
            onCambiar={(tipo) => setF((x) => conTipo(x, tipo))}
          />
          <Text style={styles.nota}>{TIPOS_PLAN.find((t) => t.valor === f.tipo)?.ayuda}</Text>
        </Grupo>

        <SelectorIcono etiqueta="Icono" valor={f.icono} sugeridos={EMOJIS_PLAN} onCambiar={(icono) => setF((x) => ({ ...x, icono }))} error={intentado ? errores.icono : null} />

        <Grupo etiqueta="Nombre">
          <TextInput
            accessibilityLabel="Nombre"
            value={f.nombre}
            onChangeText={(nombre) => setF((x) => ({ ...x, nombre }))}
            maxLength={MAX_NOMBRE_PLAN}
            placeholder={f.tipo === 'trip' ? 'Escapada a Lisboa' : f.tipo === 'celebration' ? 'Cumpleaños de Marta' : 'Mudanza, Navidad…'}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="sentences"
            returnKeyType="done"
            style={styles.campo}
          />
          <MensajeError texto={intentado ? errores.nombre : null} />
        </Grupo>

        {f.tipo === 'trip' ? (
          <Grupo etiqueta="Destino">
            <TextInput
              accessibilityLabel="Destino"
              value={f.destino}
              onChangeText={(destino) => setF((x) => ({ ...x, destino }))}
              maxLength={MAX_NOMBRE_PLAN}
              placeholder="Lisboa, Portugal"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="words"
              returnKeyType="done"
              style={styles.campo}
            />
          </Grupo>
        ) : null}

        <Grupo etiqueta={unDia ? 'Fecha' : 'Desde'} rol="radiogroup">
          <SelectorFecha valor={f.inicio} onCambiar={(inicio) => setF((x) => conInicio(x, inicio))} modo="todas" />
        </Grupo>
        {!unDia ? (
          <Grupo etiqueta="Hasta">
            <BotonFecha
              valor={f.fin}
              texto={`${fechaCorta(f.fin, deISO(hoy))} · ${textoDuracion(dias)}`}
              etiqueta={`Hasta: ${fechaLarga(f.fin, deISO(hoy))}, ${textoDuracion(dias)}`}
              minimo={f.inicio}
              maximo={sumarDias(f.inicio, MAX_DIAS_PLAN - 1)}
              rangoDesde={f.inicio}
              onCambiar={(fin) => setF((x) => ({ ...x, fin }))}
            />
            <MensajeError texto={intentado ? errores.fechas : null} />
          </Grupo>
        ) : null}

        {presupuestos ? (
          <Grupo etiqueta="Presupuesto">
            <View style={styles.importeFila}>
              <TextInput
                accessibilityLabel="Presupuesto en euros (opcional)"
                value={f.presupuesto}
                onChangeText={(t) => setF((x) => ({ ...x, presupuesto: t.replace(/[^0-9.,]/g, '') }))}
                placeholder="Opcional"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
                inputMode="decimal"
                returnKeyType="done"
                style={[styles.campo, styles.importe]}
              />
              <Text style={styles.euro} importantForAccessibility="no">
                €
              </Text>
            </View>
            <MensajeError texto={intentado ? errores.presupuesto : null} />
          </Grupo>
        ) : null}

        <Grupo etiqueta="¿Cómo se paga?" rol="radiogroup">
          <FilaChips>
            <Chip rol="radio" etiqueta="A medias" activo={f.division === 'half'} onPress={() => setF((x) => ({ ...x, division: 'half' }))} />
            {sinProporcional ? null : (
              <Chip
                rol="radio"
                etiqueta={`Proporcional ${pctProporcionalYo}/${100 - pctProporcionalYo}`}
                activo={f.division === 'proportional'}
                onPress={() => setF((x) => ({ ...x, division: 'proportional' }))}
              />
            )}
            <Chip rol="radio" etiqueta="Personalizado" activo={f.division === 'custom'} onPress={() => setF((x) => ({ ...x, division: 'custom' }))} />
            {conBote ? <Chip rol="radio" etiqueta="Del bote" activo={f.division === 'pot'} onPress={() => setF((x) => ({ ...x, division: 'pot' }))} /> : null}
          </FilaChips>
          <Text style={styles.nota}>Así se reparten por defecto los gastos de este plan; en cada gasto se puede cambiar.</Text>
        </Grupo>
        {f.division === 'custom' ? (
          <BarraPorcentaje
            pctYo={f.pctYo}
            onCambiar={(pctYo) => setF((x) => ({ ...x, pctYo }))}
            nombrePareja={p.nombrePareja}
            importeYo={null}
            importePareja={null}
            tintaYo={p.tintaYo}
            tintaPareja={p.tintaPareja}
            fondoYo={p.yo.color ? personColors[p.yo.color].bg : colors.surface}
            fondoPareja={p.otra?.color ? personColors[p.otra.color].bg : colors.divider}
          />
        ) : null}

        {!editando && PLANTILLAS[f.tipo].length > 0 ? (
          <Grupo etiqueta="Tareas sugeridas">
            <CasillasSugeridas tipo={f.tipo} desmarcadas={desmarcadas} onCambiar={setDesmarcadas} />
            <Text style={styles.nota}>Se añaden al plan; luego podéis cambiarlas, asignarlas o borrarlas.</Text>
          </Grupo>
        ) : null}

        <Grupo etiqueta="Notas">
          <TextInput
            accessibilityLabel="Notas"
            value={f.notas}
            onChangeText={(notas) => setF((x) => ({ ...x, notas }))}
            maxLength={MAX_NOTAS_PLAN}
            placeholder="Lo que no queréis olvidar"
            placeholderTextColor={colors.textSecondary}
            multiline
            autoCapitalize="sentences"
            style={[styles.campo, styles.notas]}
          />
        </Grupo>

      </ScrollView>

      <View style={[styles.pie, { paddingBottom: insets.bottom + 20 }]}>
        <MensajeError texto={error ?? (intentado && hayErroresPlan(errores) ? 'Revisa los campos marcados en rojo.' : null)} />
        <BotonPrincipal etiqueta={editando ? 'Guardar cambios' : 'Crear plan'} cargando={ocupado} onPress={() => guardar(null)} />
      </View>

      <Hoja visible={aMover !== null} titulo="¿Mover también el itinerario?" onCerrar={() => setAMover(null)} bloqueada={ocupado}>
        {aMover && plan ? (
          <>
            <Text style={styles.nota}>
              Vais a pasar del {fechaCorta(plan.start_date, deISO(hoy))} al {fechaCorta(f.inicio, deISO(hoy))}. Mover todo desplaza cada elemento los mismos días que el inicio.
            </Text>
            <BotonPrincipal etiqueta={textoMoverTodo(aMover.length)} cargando={ocupado} onPress={() => guardar(true)} />
            {fueraTodo > 0 ? <Text style={styles.nota}>{avisoQuedaranFuera(fueraTodo)}</Text> : null}
            <BotonSecundario etiqueta="Solo las fechas del plan" deshabilitado={ocupado} onPress={() => guardar(false)} />
            {fueraSolo > 0 ? <Text style={styles.nota}>{avisoQuedaranFuera(fueraSolo)}</Text> : null}
          </>
        ) : null}
      </Hoja>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colors.background },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  cerrar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cerrarHueco: { width: 44 },
  titulo: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  contenido: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, gap: 14 },
  campo: { height: 50, paddingHorizontal: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.white, fontFamily: fonts.body, fontSize: 16, color: colors.text },
  notas: { height: undefined, minHeight: 96, paddingTop: 14, paddingBottom: 14, textAlignVertical: 'top' },
  nota: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  importeFila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  importe: { flex: 1 },
  euro: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.textSecondary },
  pie: { gap: 12, paddingHorizontal: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
});
