import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, RefreshControl, Switch, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { CabeceraPestana, useScrollCabecera } from '@/components/CabeceraPestana';
import { TarjetasPendientes } from '@/components/inicio/TarjetasPendientes';
import { FilaGasto } from '@/components/gastos/FilaGasto';
import { FilaPlanGasto } from '@/components/gastos/FilaPlanGasto';
import { HojaSaldar } from '@/components/gastos/HojaSaldar';
import { TarjetaBote, TarjetaSaldo } from '@/components/gastos/TarjetaSaldo';
import { TarjetaRecurrentes } from '@/components/gastos/TarjetaRecurrentes';
import { boteConPendiente } from '@/lib/gastos/bote';
import { BotonPrincipal, BotonSecundario } from '@/components/onboarding/Botones';
import { fonts, radius, spacing } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { formatearImporte } from '@/lib/dinero/importe';
import { agruparPorPlan, claveFila } from '@/lib/gastos/agrupar';
import { personas } from '@/lib/gastos/personas';
import { useInvalidarGastos, usePagoRechazado, useResumenesPlanes, useSaldo, useUltimosParaAgrupar } from '@/lib/gastos/useGastos';
import { useEstado } from '@/lib/pareja/EstadoProvider';

const CLAVE_RECHAZOS = 'ito.avisos_rechazo_cerrados';
const CLAVE_SOLO_SIN_SALDAR = 'ito.solo_sin_saldar';
/** Filas de «Últimos gastos» (un plan cuenta como una). */
const FILAS_ULTIMOS = 5;

/** Pestaña Gastos (mockup «Dinero»): saldo, bote (solo lectura) y últimos gastos. Saldar llega en la fase 2. */
export default function Gastos() {
  const colors = useColores();
  const styles = useStyles();
  const router = useRouter();
  const { onScroll, sombra } = useScrollCabecera();
  const { pareja } = useEstado();
  const saldo = useSaldo();
  // Interruptor «Solo sin saldar» en Últimos gastos (se recuerda en este dispositivo).
  const [soloSinSaldar, setSoloSinSaldar] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(CLAVE_SOLO_SIN_SALDAR)
      .then((v) => setSoloSinSaldar(v === '1'))
      .catch(() => undefined);
  }, []);
  const cambiarFiltro = (v: boolean) => {
    setSoloSinSaldar(v);
    AsyncStorage.setItem(CLAVE_SOLO_SIN_SALDAR, v ? '1' : '0').catch(() => undefined);
  };
  const ultimos = useUltimosParaAgrupar(soloSinSaldar);
  const resumenes = useResumenesPlanes();
  const invalidar = useInvalidarGastos();
  // Al entrar en la pestaña se recarga: no depende solo del tiempo real.
  useFocusEffect(
    useCallback(() => {
      invalidar();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );
  const rechazado = usePagoRechazado();
  const [saldando, setSaldando] = useState(false);
  // El aviso del pago rechazado se puede cerrar (se recuerda en este dispositivo). Revisión I7.
  const [cerrados, setCerrados] = useState<string[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(CLAVE_RECHAZOS)
      .then((v) => setCerrados(v ? (JSON.parse(v) as string[]) : []))
      .catch(() => undefined);
  }, []);
  const cerrarAviso = (id: string) => {
    const nuevos = [...cerrados, id].slice(-20);
    setCerrados(nuevos);
    AsyncStorage.setItem(CLAVE_RECHAZOS, JSON.stringify(nuevos)).catch(() => undefined);
  };
  const avisoRechazo = rechazado.data && !cerrados.includes(rechazado.data.id) ? rechazado.data : null;

  if (!pareja) return null;
  const cargando = saldo.isLoading || ultimos.isLoading;
  const fallo = saldo.isError || ultimos.isError;
  // Los gastos de un plan salen en una sola fila con el total de todo el plan; el resto, sueltos. Los saldos no cambian.
  const gastos = agruparPorPlan(ultimos.data ?? [], resumenes.data).slice(0, FILAS_ULTIMOS);
  const nuevo = () => router.push('/gastos/nuevo');

  return (
    <View style={styles.raiz}>
      <CabeceraPestana titulo="Gastos" sombra={sombra} cargando={cargando || saldo.isRefetching || ultimos.isRefetching} />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.contenido}
        refreshControl={
          <RefreshControl refreshing={saldo.isRefetching || ultimos.isRefetching} onRefresh={invalidar} tintColor="transparent" colors={['transparent']} progressBackgroundColor="transparent" />
        }
      >
        {cargando ? null : fallo ? (
          <View style={styles.vacio}>
            <Text style={styles.vacioTexto}>No se han podido cargar los gastos.</Text>
            <BotonSecundario etiqueta="Reintentar" onPress={invalidar} />
          </View>
        ) : (
          <>
            {avisoRechazo ? (
              <View style={styles.rechazo}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/gastos/pago/[id]', params: { id: avisoRechazo.id } })}
                  style={styles.rechazoCuerpo}
                >
                  <Ionicons name="alert-circle-outline" size={20} color={colors.accent} />
                  <Text style={styles.rechazoTexto}>
                    {personas(pareja, colors).nombrePareja} dice que no ha recibido tu pago de {formatearImporte(avisoRechazo.amount_cents)}. Los
                    gastos vuelven a estar pendientes.
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar aviso"
                  onPress={() => cerrarAviso(avisoRechazo.id)}
                  style={styles.rechazoCerrar}
                >
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </Pressable>
              </View>
            ) : null}
            <TarjetasPendientes compacta />
            <TarjetaSaldo saldo={saldo.data ?? null} pareja={pareja} onSaldar={() => setSaldando(true)} />
            {saldo.data && (saldo.data.pot_enabled || boteConPendiente(saldo.data)) ? <TarjetaBote saldo={saldo.data} onAbrir={() => router.push('/gastos/bote')} /> : null}
            <TarjetaRecurrentes onAbrir={() => router.push('/gastos/recurrentes')} />

            {gastos.length === 0 && !soloSinSaldar ? (
              <View style={styles.vacio}>
                <Ionicons name="wallet-outline" size={40} color={colors.textSecondary} />
                <Text style={styles.vacioTitulo}>Aún no hay gastos</Text>
                <Text style={styles.vacioTexto}>Apunta el primero e ito llevará las cuentas por vosotros.</Text>
                <View style={styles.vacioBoton}>
                  <BotonPrincipal etiqueta="Añadir gasto" onPress={nuevo} />
                </View>
              </View>
            ) : (
              <View style={styles.seccion}>
                <View style={styles.seccionCabecera}>
                  <Text accessibilityRole="header" style={styles.seccionTitulo}>
                    ÚLTIMOS GASTOS
                  </Text>
                  <Pressable accessibilityRole="link" onPress={() => router.push('/gastos/historial')} style={styles.verTodos}>
                    <Text style={styles.verTodosTexto}>Ver todos</Text>
                  </Pressable>
                </View>
                <View style={styles.filtro}>
                  <Text style={styles.filtroTexto} nativeID="solo-sin-saldar">
                    Solo sin saldar
                  </Text>
                  <Switch
                    accessibilityLabel="Ver solo los gastos sin saldar"
                    value={soloSinSaldar}
                    onValueChange={cambiarFiltro}
                    trackColor={{ true: colors.accent, false: colors.switchOff }}
                    thumbColor={colors.thumb}
                    // En web la bolita usa activeThumbColor (react-native-web); en nativo basta thumbColor.
                    {...{ activeThumbColor: colors.thumb }}
                  />
                </View>
                {gastos.length === 0 ? (
                  <Text style={styles.todoSaldado}>Todo está saldado. No queda nada pendiente entre vosotros.</Text>
                ) : null}
                <View style={[styles.lista, gastos.length === 0 && { display: 'none' }]}>
                  {gastos.map((f, i) =>
                    f.tipo === 'plan' ? (
                      <FilaPlanGasto
                        key={claveFila(f)}
                        fila={f}
                        conFecha
                        separador={i < gastos.length - 1}
                        onPress={() => router.push({ pathname: '/planificador/[id]', params: { id: f.plan.id } })}
                      />
                    ) : (
                      <FilaGasto
                        key={claveFila(f)}
                        gasto={f.gasto}
                        pareja={pareja}
                        conFecha
                        separador={i < gastos.length - 1}
                        onPress={() => router.push({ pathname: '/gastos/[id]', params: { id: f.gasto.id } })}
                      />
                    ),
                  )}
                </View>
              </View>
            )}
          </>
        )}
      </Animated.ScrollView>

      {saldando ? <HojaSaldar onCerrar={() => setSaldando(false)} /> : null}

      {gastos.length > 0 || soloSinSaldar ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Añadir gasto"
          onPress={nuevo}
          style={({ pressed }) => [styles.mas, pressed && { backgroundColor: colors.accentDark }]}
        >
          <Ionicons name="add" size={28} color={colors.onAccent} />
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = crearEstilos((colors) => ({
  raiz: { flex: 1, backgroundColor: colors.background },
  contenido: { paddingHorizontal: 20, paddingTop: spacing.sm, paddingBottom: 100, gap: 12 },
  rechazo: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, backgroundColor: colors.accentSoft },
  rechazoCuerpo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingLeft: 14 },
  rechazoCerrar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  rechazoTexto: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.text },
  seccion: { gap: 4, marginTop: 4 },
  seccionCabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seccionTitulo: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.textSecondary },
  verTodos: { minHeight: 44, justifyContent: 'center' },
  filtro: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginBottom: 4 },
  filtroTexto: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  todoSaldado: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingVertical: 16 },
  verTodosTexto: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.accent },
  lista: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl - 4,
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  vacio: { alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 12 },
  vacioTitulo: { fontFamily: fonts.title, fontSize: 21, color: colors.text },
  vacioTexto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary, textAlign: 'center' },
  vacioBoton: { alignSelf: 'stretch', marginTop: 8 },
  mas: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.sombra,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
}));
