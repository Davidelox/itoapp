import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FiltrosTipo } from '@/components/calendario/FiltrosTipo';
import { ListaDias } from '@/components/calendario/ListaDias';
import { RejillaMes } from '@/components/calendario/RejillaMes';
import { SemanaDetallada } from '@/components/calendario/SemanaDetallada';
import { BotonSecundario } from '@/components/onboarding/Botones';
import { Segmentado } from '@/components/onboarding/OpcionRadio';
import { colors, fonts } from '@/constants/theme';
import { type Elemento, type Filtro, agruparPorDia, aElementos, construirLista, filtrar } from '@/lib/calendario/agrupar';
import { coloresDeHuecos } from '@/lib/calendario/colores';
import { gastoDeCobro } from '@/lib/calendario/consultas';
import { type Objetivo, filtroParaVer, leerObjetivo } from '@/lib/calendario/destino';
import { type Vista, etiquetaPeriodo, mismoPeriodo, mover, rangoVisible, semanaDe, semanasDelMes } from '@/lib/calendario/rejilla';
import { useBorradosPendientes, useCalendario } from '@/lib/calendario/useCalendario';
import { hoyISO } from '@/lib/gastos/fechas';
import { personas } from '@/lib/gastos/personas';
import { useRecurrentes } from '@/lib/gastos/useGastos';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/** Cuánto se ve resaltada la fila del evento o pago recién guardado. */
const RESALTADO_MS = 2500;

/** Pestaña Calendario (mockup «Agenda», docs/plan-calendario.md §2): ver, abrir un evento o un pago y añadir eventos. */
export default function Calendario() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pareja } = useEstado();
  const hoy = hoyISO();
  const [vista, setVista] = useState<Vista>('mes');
  // Un día cualquiera del periodo que se ve (el mes o la semana que lo contiene).
  const [ancla, setAncla] = useState(hoy);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  // Al volver de guardar un evento o un pago llegan `?dia=YYYY-MM-DD&evento=<id>` (en un pago, el id del recurrente):
  // se consumen una vez (`objetivo`), se limpian de la ruta y el elemento se resalta unos segundos (`resaltado`).
  const { dia: diaRuta, evento: eventoRuta } = useLocalSearchParams<{ dia?: string; evento?: string }>();
  const [objetivo, setObjetivo] = useState<Objetivo | null>(null);
  const [resaltado, setResaltado] = useState<string | null>(null);
  // Al seleccionar un día en la Semana, la pantalla baja hasta su lista (y_lista: dónde empieza, de `onLayout`).
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const yLista = useRef(0);
  // Hay que bajar a la lista en cuanto se mida (el día seleccionado acaba de aparecer y su lista aún no está pintada).
  const bajarPendiente = useRef(false);
  const bajarALista = () => scrollRef.current?.scrollTo({ y: Math.max(0, yLista.current - 8), animated: true });

  const consulta = useCalendario(rangoVisible(vista, ancla), [
    rangoVisible(vista, mover(vista, ancla, -1)),
    rangoVisible(vista, mover(vista, ancla, 1)),
  ]);
  const recurrentes = useRecurrentes();
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
  // si el filtro lo ocultara, pasa a «Todos», y se resalta. Si no aparece, el día queda seleccionado y nada más.
  if (objetivo && consulta.data && !consulta.isFetching && !consulta.isPlaceholderData) {
    const elemento = objetivo.evento ? aElementos(consulta.data).find((e) => e.origenId === objetivo.evento) : undefined;
    setObjetivo(null);
    if (elemento) {
      setFiltro(filtroParaVer(filtro, elemento));
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
  }, [resaltado]);

  if (!pareja) return null;
  const p = personas(pareja);
  const recargar = () => {
    refetch();
    recargarRecurrentes();
    recargarBorrados();
  };

  // `calendar_range` no dice si un pago es único o recurrente: sale de la lista de recurrentes.
  const frecuencias = new Map((recurrentes.data ?? []).map((r) => [r.id, r.frequency]));
  const elementos = filtrar(aElementos(consulta.data ?? [], frecuencias), filtro);
  const porDia = agruparPorDia(elementos);
  const lista = construirLista({ vista, ancla, seleccionado, hoy, elementos, filtro });
  const colores = coloresDeHuecos(pareja);
  const contexto = {
    yo: p.yo.slot,
    nombrePareja: p.nombrePareja,
    conPareja: !!p.otra,
    recurrentes: new Map((recurrentes.data ?? []).map((r) => [r.id, r])),
    pendientesDeBorrar: borrados.data,
  };

  const ir = (n: number) => {
    setAncla(mover(vista, ancla, n));
    setSeleccionado(null);
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
    if (iso === seleccionado) {
      bajarPendiente.current = false;
      setSeleccionado(null);
      return;
    }
    setSeleccionado(iso);
    // Un día de otro mes cambia de mes.
    if (vista === 'mes' && iso.slice(0, 7) !== ancla.slice(0, 7)) setAncla(iso);
    // En la Semana la lista del día sale debajo de las 7 filas y la pantalla baja hasta ella: ya medida (había otro
    // día seleccionado), al momento; si no, en cuanto se pinte y mida (`onLayout` de la lista).
    if (vista === 'semana') {
      if (seleccionado) bajarALista();
      else bajarPendiente.current = true;
    }
  };

  // «Añadir evento»: con el día seleccionado, también si es pasado (si no, hoy); y el filtro activo elige el
  // tipo: Cumpleaños → cumpleaños, Pagos → pago, Viajes / Comer fuera / Ocio → un evento de esa categoría.
  const nuevoEvento = () => {
    const params: Record<string, string> = {};
    if (seleccionado) params.fecha = seleccionado;
    if (filtro === 'birthday') params.tipo = 'cumple';
    else if (filtro === 'payment') params.tipo = 'pago';
    else if (filtro === 'trip' || filtro === 'eating_out' || filtro === 'leisure') params.categoria = filtro;
    router.push({ pathname: '/calendario/nuevo', params });
  };
  // La repetición se identifica por su INICIO, no por el día que se ha tocado: un viaje repartido por sus días
  // abre su detalle con la fecha en que empieza, o el servidor rechazaría «solo esta vez» (TW060).
  const abrirEvento = (e: Elemento) => router.push({ pathname: '/calendario/evento/[id]', params: { id: e.origenId, fecha: e.inicio } });
  const abrirLinea = (e: Elemento) => (e.tipo === 'payment' ? abrirPago(e) : abrirEvento(e));

  // Pago cobrado → su gasto; previsto o pendiente (o si el gasto no se ve) → el recurrente.
  const abrirPago = async (e: Elemento) => {
    if (abriendo) return;
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

  return (
    <View style={styles.raiz}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.contenido, { paddingTop: insets.top + 16 }]}
        refreshControl={<RefreshControl refreshing={consulta.isRefetching} onRefresh={recargar} tintColor={colors.accent} />}
      >
        <Text accessibilityRole="header" style={styles.titulo}>
          Calendario
        </Text>

        <View style={styles.periodo}>
          <View style={styles.navegacion}>
            <Pressable accessibilityRole="button" accessibilityLabel={vista === 'mes' ? 'Mes anterior' : 'Semana anterior'} onPress={() => ir(-1)} style={styles.flecha}>
              <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
            </Pressable>
            <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.etiqueta} numberOfLines={1}>
              {etiquetaPeriodo(vista, ancla, Number(hoy.slice(0, 4)))}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={vista === 'mes' ? 'Mes siguiente' : 'Semana siguiente'} onPress={() => ir(1)} style={styles.flecha}>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          {enPeriodoActual ? null : (
            <Pressable accessibilityRole="button" accessibilityLabel={vista === 'mes' ? 'Ir al mes actual' : 'Ir a la semana actual'} onPress={irAHoy} style={styles.hoy}>
              <Text style={styles.hoyTexto}>Hoy</Text>
            </Pressable>
          )}
        </View>

        <Segmentado
          etiqueta="Vista del calendario"
          opciones={[
            { valor: 'mes', etiqueta: 'Mes' },
            { valor: 'semana', etiqueta: 'Semana' },
          ]}
          valor={vista}
          onCambiar={cambiarVista}
        />
        <FiltrosTipo valor={filtro} onCambiar={setFiltro} />

        {consulta.isError && !consulta.data ? (
          <View style={styles.error}>
            <Text style={styles.errorTexto}>No se ha podido cargar el calendario.</Text>
            <BotonSecundario etiqueta="Reintentar" onPress={recargar} />
          </View>
        ) : consulta.isLoading ? (
          <ActivityIndicator color={colors.accent} style={styles.cargando} />
        ) : (
          <>
            {vista === 'mes' ? (
              <RejillaMes
                semanas={semanasDelMes(ancla)}
                mes={ancla.slice(0, 7)}
                hoy={hoy}
                seleccionado={seleccionado}
                porDia={porDia}
                elementos={elementos}
                colores={colores}
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
                onDia={tocarDia}
                onLinea={abrirLinea}
              />
            )}
            {cargando ? (
              <ActivityIndicator color={colors.accent} style={styles.cargando} />
            ) : lista ? (
              <View
                onLayout={(ev) => {
                  yLista.current = ev.nativeEvent.layout.y;
                  if (bajarPendiente.current) {
                    bajarPendiente.current = false;
                    bajarALista();
                  }
                }}
              >
                <ListaDias
                  lista={lista}
                  hoy={hoy}
                  contexto={contexto}
                  colores={colores}
                  onPago={abrirPago}
                  onEvento={abrirEvento}
                  onNuevo={filtro === 'payment' ? undefined : nuevoEvento}
                  resaltado={resaltado}
                />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Añadir evento"
        onPress={nuevoEvento}
        style={({ pressed }) => [styles.mas, pressed && { backgroundColor: colors.accentDark }]}
      >
        <Ionicons name="add" size={28} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colors.background },
  contenido: { paddingHorizontal: 20, paddingBottom: 120, gap: 12 },
  titulo: { fontFamily: fonts.title, fontSize: 30, color: colors.text, marginBottom: 4 },
  periodo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  navegacion: { flexDirection: 'row', alignItems: 'center', marginLeft: -12, flexShrink: 1 },
  flecha: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  etiqueta: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text, flexShrink: 1 },
  hoy: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hoyTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.accent },
  cargando: { marginTop: 24 },
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
