import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Extrapolation, FadeIn, interpolate, useAnimatedRef, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { CabeceraPestana, useScrollCabecera } from '@/components/CabeceraPestana';
import { BarraPeriodo } from '@/components/calendario/BarraPeriodo';
import { ListaDias } from '@/components/calendario/ListaDias';
import { RejillaMes } from '@/components/calendario/RejillaMes';
import { SemanaDetallada } from '@/components/calendario/SemanaDetallada';
import { HojaImporte } from '@/components/gastos/HojaImporte';
import { BotonSecundario } from '@/components/onboarding/Botones';
import { colors, fonts } from '@/constants/theme';
import { type Elemento, type Filtros, agruparPorDia, aElementos, construirLista, filtrar, infoPagos } from '@/lib/calendario/agrupar';
import { coloresDeHuecos } from '@/lib/calendario/colores';
import { gastoDeCobro } from '@/lib/calendario/consultas';
import { DESPLAZAMIENTO_SALIDA, decidirDeslizamiento } from '@/lib/calendario/deslizar';
import { type Objetivo, filtroParaVer, leerObjetivo, rutaDeElemento } from '@/lib/calendario/destino';
import { sugerenciaNuevo } from '@/lib/calendario/filtros';
import { type Vista, mismoPeriodo, mover, rangoVisible, semanaDe, semanasDelMes } from '@/lib/calendario/rejilla';
import { dentroDeLimites, direccionSalto } from '@/lib/calendario/selectorMes';
import { useBorradosPendientes, useCalendario } from '@/lib/calendario/useCalendario';
import { hoyISO } from '@/lib/gastos/fechas';
import type { Cobro, Recurrente } from '@/lib/gastos/recurrentes';
import { personas } from '@/lib/gastos/personas';
import { useInvalidarGastos, useRecurrentes } from '@/lib/gastos/useGastos';
import { useSitios } from '@/lib/mapa/useSitios';
import { usePresupuestos } from '@/lib/ajustes/presupuestos';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { usePlanes } from '@/lib/planificador/usePlanificador';

/** Cuánto se ve resaltada la fila del evento o pago recién guardado. */
const RESALTADO_MS = 2500;
/** Tras arrastrar la rejilla, los toques se ignoran este rato (en web el `click` puede llegar al soltar). */
const IGNORAR_TOQUE_MS = 250;

/** Pestaña Calendario (mockup «Agenda», docs/plan-calendario.md §2): ver, abrir un evento o un pago y añadir eventos. */
export default function Calendario() {
  const presupuestos = usePresupuestos();
  const router = useRouter();
  const { onScroll, sombra } = useScrollCabecera();
  const { pareja } = useEstado();
  const hoy = hoyISO();
  const [vista, setVista] = useState<Vista>('mes');
  // Un día cualquiera del periodo que se ve (el mes o la semana que lo contiene).
  const [ancla, setAncla] = useState(hoy);
  const [filtros, setFiltros] = useState<Filtros>([]);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  const [importeDe, setImporteDe] = useState<{ cobro: Cobro; recurrente: Recurrente } | null>(null);
  const invalidar = useInvalidarGastos();
  // Al volver de guardar un evento o un pago llegan `?dia=YYYY-MM-DD&evento=<id>` (en un pago, el id del recurrente):
  // se consumen una vez (`objetivo`), se limpian de la ruta y el elemento se resalta unos segundos (`resaltado`).
  const { dia: diaRuta, evento: eventoRuta } = useLocalSearchParams<{ dia?: string; evento?: string }>();
  const [objetivo, setObjetivo] = useState<Objetivo | null>(null);
  const [resaltado, setResaltado] = useState<string | null>(null);
  // Al seleccionar un día en la Semana, la pantalla baja hasta su lista (y_lista: dónde empieza, de `onLayout`).
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const yLista = useRef(0);
  // Hay que bajar a la lista en cuanto se mida (el día seleccionado acaba de aparecer y su lista aún no está pintada).
  const bajarPendiente = useRef(false);
  const bajarALista = () => scrollRef.current?.scrollTo({ y: Math.max(0, yLista.current - 8), animated: true });

  const consulta = useCalendario(rangoVisible(vista, ancla), [
    rangoVisible(vista, mover(vista, ancla, -1)),
    rangoVisible(vista, mover(vista, ancla, 1)),
  ]);
  const recurrentes = useRecurrentes();
  const sitios = useSitios();
  const planes = usePlanes();
  const borrados = useBorradosPendientes();
  const { refetch } = consulta;
  const { refetch: recargarRecurrentes } = recurrentes;
  const { refetch: recargarBorrados } = borrados;
  // Al entrar en la pestaña se recarga: no depende solo del tiempo real.
  useFocusEffect(
    useCallback(() => {
      refetch();
      recargarRecurrentes();
      recargarBorrados();
    }, [refetch, recargarRecurrentes, recargarBorrados]),
  );

  // 1) Llega un destino: el mes o la semana de ese día (la vista no cambia) y el día seleccionado. Se ajusta el estado
  // al renderizar (como en editar evento) y un efecto limpia la ruta, para que no se repita al volver a enfocar.
  const rutaClave = `${diaRuta ?? ''}|${eventoRuta ?? ''}`;
  const [rutaVista, setRutaVista] = useState('|');
  if (rutaClave !== rutaVista) {
    setRutaVista(rutaClave);
    const o = leerObjetivo(diaRuta, eventoRuta);
    if (o) {
      setObjetivo(o);
      setAncla(o.dia);
      setSeleccionado(o.dia);
      setResaltado(null);
    }
  }
  useEffect(() => {
    if (diaRuta !== undefined || eventoRuta !== undefined) router.setParams({ dia: undefined, evento: undefined });
  }, [diaRuta, eventoRuta, router]);

  // 2) Con los datos de ese periodo ya cargados (no los del periodo anterior, ni a medio recargar) se busca el elemento:
  // si los filtros lo ocultaran, se añade su opción, y se resalta. Si no aparece, el día queda seleccionado y nada más.
  if (objetivo && consulta.data && !consulta.isFetching && !consulta.isPlaceholderData) {
    const elemento = objetivo.evento ? aElementos(consulta.data).find((e) => e.origenId === objetivo.evento) : undefined;
    setObjetivo(null);
    if (elemento) {
      setFiltros(filtroParaVer(filtros, elemento));
      setResaltado(elemento.origenId);
    }
  }

  // 3) Resaltado: baja hasta la lista del día y se apaga solo.
  useEffect(() => {
    if (!resaltado) return;
    const baja = setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, yLista.current - 8), animated: true }), 150);
    const apaga = setTimeout(() => setResaltado(null), RESALTADO_MS);
    return () => {
      clearTimeout(baja);
      clearTimeout(apaga);
    };
  }, [resaltado, scrollRef]);

  // Deslizar la rejilla para cambiar de periodo (docs/plan-cabeceras-calendario.md §4). `x` es lo que se ha movido la
  // rejilla (en el hilo de UI); `entrada` dice hacia dónde ha cambiado el periodo (-1 / 1) para que el nuevo entre
  // deslizando desde ese lado; `ultimoArrastre`, cuándo acabó el último arrastre (para ignorar el toque que lo suelta).
  const x = useSharedValue(0);
  const anchoRejilla = useSharedValue(375);
  const entrada = useRef(0);
  const ultimoArrastre = useRef(0);
  // 1 mientras el gesto de deslizar está activo: las celdas y filas apagan su feedback de pulsación al instante.
  const arrastre = useSharedValue(0);
  const reducida = useReducedMotion();
  const ir = (n: number) => {
    const nueva = mover(vista, ancla, n);
    // Se para en los límites del selector (2000–2100): ni las flechas ni el gesto llevan más allá.
    // Si el gesto ya había sacado la rejilla, `x` vuelve a 0 (el periodo no cambia, así que nada más la recolocaría).
    if (!dentroDeLimites(nueva)) {
      x.set(withTiming(0, { duration: 160 }));
      return;
    }
    entrada.current = n;
    setAncla(nueva);
    setSeleccionado(null);
  };
  // Salto desde el desplegable del periodo: entra desde el lado del que viene (o sin movimiento si es el mismo).
  const saltarA = (nueva: string) => {
    entrada.current = direccionSalto(vista, ancla, nueva);
    setAncla(nueva);
    setSeleccionado(null);
  };
  const marcarArrastre = () => {
    ultimoArrastre.current = Date.now();
  };
  const cambiarPorGesto = (d: number) => {
    marcarArrastre();
    ir(d);
  };
  const arrastrando = () => Date.now() - ultimoArrastre.current < IGNORAR_TOQUE_MS;
  const deslizar = usePanGesture({
    activeOffsetX: [-16, 16],
    failOffsetY: [-12, 12],
    onActivate: () => {
      'worklet';
      arrastre.set(1);
      scheduleOnRN(marcarArrastre);
    },
    onUpdate: (e) => {
      'worklet';
      x.set(e.translationX * 0.35);
    },
    onDeactivate: (e) => {
      'worklet';
      arrastre.set(0);
      scheduleOnRN(marcarArrastre);
      const d = e.canceled ? 0 : decidirDeslizamiento(e.translationX, e.velocityX, anchoRejilla.get());
      if (d === 0) {
        x.set(withTiming(0, { duration: 160 }));
        return;
      }
      // Sale hacia el lado del gesto y, ya fuera, cambia el periodo: la nueva rejilla entra desde el lado contrario.
      x.set(
        withTiming(-d * DESPLAZAMIENTO_SALIDA, { duration: 110 }, (fin) => {
          if (fin) scheduleOnRN(cambiarPorGesto, d);
        }),
      );
    },
  });
  // El periodo nuevo se pinta ya con el valor de salida y se desliza hasta su sitio. En `useLayoutEffect` para que
  // el cambio llegue después de pintar el periodo nuevo (sin un fotograma del viejo entrando). Escribe un valor
  // compartido, no estado.
  useLayoutEffect(() => {
    const d = entrada.current;
    if (!d) return;
    entrada.current = 0;
    x.set(d * DESPLAZAMIENTO_SALIDA);
    x.set(withTiming(0, { duration: 180 }));
  }, [vista, ancla, x]);
  const estiloRejilla = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }],
    opacity: interpolate(Math.abs(x.get()), [0, DESPLAZAMIENTO_SALIDA], [1, 0.25], Extrapolation.CLAMP),
  }));

  if (!pareja) return null;
  const p = personas(pareja);
  const recargar = () => {
    refetch();
    recargarRecurrentes();
    recargarBorrados();
  };

  // `calendar_range` no dice si un pago es único o recurrente, ni si es en solitario: sale de la lista de recurrentes.
  const elementos = filtrar(aElementos(consulta.data ?? [], infoPagos(recurrentes.data ?? [])), filtros);
  const porDia = agruparPorDia(elementos);
  const lista = construirLista({ vista, ancla, seleccionado, hoy, elementos, filtros });
  const colores = coloresDeHuecos(pareja);
  const contexto = {
    presupuestos,
    yo: p.yo.slot,
    nombrePareja: p.nombrePareja,
    conPareja: !!p.otra,
    recurrentes: new Map((recurrentes.data ?? []).map((r) => [r.id, r])),
    pendientesDeBorrar: borrados.data,
    sitios: new Map((sitios.data ?? []).map((s) => [s.id, s.name])),
    planes: new Map((planes.data ?? []).map((pl) => [pl.id, { emoji: pl.icon, nombre: pl.name }])),
  };

  const irAHoy = () => {
    setAncla(hoy);
    setSeleccionado(null);
  };
  const cambiarVista = (v: Vista) => {
    setVista(v);
    // Si hay un día elegido, el nuevo periodo es el suyo.
    if (seleccionado) setAncla(seleccionado);
  };
  const tocarDia = (iso: string) => {
    if (arrastrando()) return;
    if (iso === seleccionado) {
      bajarPendiente.current = false;
      setSeleccionado(null);
      return;
    }
    setSeleccionado(iso);
    // Un día de otro mes cambia de mes.
    // (los días grises de fuera de los límites, dic 1999 o ene 2101, se seleccionan pero no cambian de mes).
    if (vista === 'mes' && iso.slice(0, 7) !== ancla.slice(0, 7) && dentroDeLimites(iso)) setAncla(iso);
    // En la Semana la lista del día sale debajo de las 7 filas y la pantalla baja hasta ella: ya medida (había otro
    // día seleccionado), al momento; si no, en cuanto se pinte y mida (`onLayout` de la lista).
    if (vista === 'semana') {
      if (seleccionado) bajarALista();
      else bajarPendiente.current = true;
    }
  };

  // «Añadir evento»: con el día seleccionado, también si es pasado (si no, hoy); y un único filtro activo elige el
  // tipo: Cumpleaños → cumpleaños, Pagos → pago, Viajes / Comer fuera / Ocio → un evento de esa categoría.
  const nuevoEvento = () => {
    const params: Record<string, string> = {};
    if (seleccionado) params.fecha = seleccionado;
    Object.assign(params, sugerenciaNuevo(filtros));
    router.push({ pathname: '/calendario/nuevo', params });
  };
  // La repetición se identifica por su INICIO, no por el día que se ha tocado: un viaje repartido por sus días
  // abre su detalle con la fecha en que empieza, o el servidor rechazaría «solo esta vez» (TW060).
  const abrirEvento = (e: Elemento) => router.push(rutaDeElemento(e));
  const abrirLinea = (e: Elemento) => {
    if (arrastrando()) return;
    if (e.tipo === 'payment') abrirPago(e);
    else abrirEvento(e);
  };

  // Pago cobrado → su gasto; pendiente de importe → la hoja «Poner importe»; previsto (o si el gasto no se ve) → el recurrente.
  const abrirPago = async (e: Elemento) => {
    if (abriendo) return;
    const recurrente = e.estado === 'pending' && e.cobroId ? recurrentes.data?.find((r) => r.id === e.origenId) : undefined;
    if (recurrente && e.cobroId) {
      setImporteDe({ cobro: { id: e.cobroId, due_date: e.inicio, status: 'pending', amount_cents: null }, recurrente });
      return;
    }
    setAbriendo(true);
    try {
      const gasto = e.estado === 'paid' && e.cobroId ? await gastoDeCobro(e.cobroId).catch(() => null) : null;
      if (gasto) router.push({ pathname: '/gastos/[id]', params: { id: gasto } });
      else router.push({ pathname: '/gastos/recurrente/[id]', params: { id: e.origenId } });
    } finally {
      setAbriendo(false);
    }
  };

  const cargando = consulta.isLoading || consulta.isPlaceholderData;
  const enPeriodoActual = mismoPeriodo(vista, ancla, hoy);
  // Con solo «Pagos» no se puede añadir un evento desde la lista.
  const soloPagos = filtros.length === 1 && filtros[0] === 'payment';

  return (
    <View style={styles.raiz}>
      <CabeceraPestana
        titulo="Calendario"
        sombra={sombra}
        cargando={cargando || consulta.isRefetching}
        accion={
          enPeriodoActual ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={vista === 'mes' ? 'Ir al mes actual' : 'Ir a la semana actual'}
              onPress={irAHoy}
              hitSlop={4}
              style={styles.hoy}
            >
              <Text style={styles.hoyTexto}>Hoy</Text>
            </Pressable>
          )
        }
      >
        <BarraPeriodo vista={vista} ancla={ancla} hoy={hoy} filtros={filtros} onVista={cambiarVista} onMover={ir} onSaltar={saltarA} onFiltros={setFiltros} />
      </CabeceraPestana>
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.contenido}
        refreshControl={<RefreshControl refreshing={consulta.isRefetching} onRefresh={recargar} tintColor="transparent" colors={['transparent']} progressBackgroundColor="transparent" />}
      >
        {consulta.isError && !consulta.data ? (
          <View style={styles.error}>
            <Text style={styles.errorTexto}>No se ha podido cargar el calendario.</Text>
            <BotonSecundario etiqueta="Reintentar" onPress={recargar} />
          </View>
        ) : consulta.isLoading ? null : (
          <>
            {/* `touchAction` (solo web táctil): sin él RNGH pone `touch-action: none` y no se podría hacer scroll vertical sobre la rejilla. */}
            <GestureDetector gesture={deslizar} touchAction="pan-y">
              <Animated.View style={estiloRejilla} onLayout={(ev) => anchoRejilla.set(ev.nativeEvent.layout.width)}>
                {vista === 'mes' ? (
                  <RejillaMes
                    semanas={semanasDelMes(ancla)}
                    mes={ancla.slice(0, 7)}
                    hoy={hoy}
                    seleccionado={seleccionado}
                    porDia={porDia}
                    elementos={elementos}
                    colores={colores}
                    arrastre={arrastre}
                    onDia={tocarDia}
                  />
                ) : (
                  <SemanaDetallada
                    dias={semanaDe(ancla)}
                    hoy={hoy}
                    seleccionado={seleccionado}
                    elementos={elementos}
                    colores={colores}
                    contexto={contexto}
                    arrastre={arrastre}
                    onDia={tocarDia}
                    onLinea={abrirLinea}
                  />
                )}
              </Animated.View>
            </GestureDetector>
            {cargando ? null : lista ? (
              <View
                onLayout={(ev) => {
                  yLista.current = ev.nativeEvent.layout.y;
                  if (bajarPendiente.current) {
                    bajarPendiente.current = false;
                    bajarALista();
                  }
                }}
              >
                {/* Al elegir otro día (o volver al periodo) la lista entra con un fundido. */}
                <Animated.View key={seleccionado ?? 'periodo'} entering={reducida ? undefined : FadeIn.duration(180)}>
                  <ListaDias
                    lista={lista}
                    hoy={hoy}
                    contexto={contexto}
                    colores={colores}
                    onPago={abrirPago}
                    onEvento={abrirEvento}
                    onNuevo={soloPagos ? undefined : nuevoEvento}
                    resaltado={resaltado}
                  />
                </Animated.View>
              </View>
            ) : null}
          </>
        )}
      </Animated.ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Añadir evento"
        onPress={nuevoEvento}
        style={({ pressed }) => [styles.mas, pressed && { backgroundColor: colors.accentDark }]}
      >
        <Ionicons name="add" size={28} color={colors.white} />
      </Pressable>
      {importeDe ? (
        <HojaImporte
          cobro={importeDe.cobro}
          recurrente={importeDe.recurrente}
          pareja={pareja}
          onCerrar={() => setImporteDe(null)}
          onHecho={() => {
            setImporteDe(null);
            invalidar();
          }}
          onVerPago={() => {
            router.push({ pathname: '/gastos/recurrente/[id]', params: { id: importeDe.recurrente.id } });
            setImporteDe(null);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colors.background },
  contenido: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120, gap: 12 },
  hoy: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hoyTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.accent },
  // En web, que arrastrar con el ratón no seleccione texto.
  error: { alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 12 },
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
    shadowColor: '#7A3419',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  errorTexto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary, textAlign: 'center' },
});
