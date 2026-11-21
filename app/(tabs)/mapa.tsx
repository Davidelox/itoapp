import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { CabeceraPestana, useScrollCabecera } from '@/components/CabeceraPestana';
import { BuscadorMapa } from '@/components/mapa/BuscadorMapa';
import { BotonFiltrosMapa, FiltrosActivosMapa } from '@/components/mapa/FiltrosMapa';
import { FilaSitio } from '@/components/mapa/FilaSitio';
import { HAY_MAPA, MapaSitios } from '@/components/mapa/MapaSitios';
import { TarjetaSitio } from '@/components/mapa/TarjetaSitio';
import { BotonSecundario } from '@/components/onboarding/Botones';
import { Segmentado } from '@/components/onboarding/OpcionRadio';
import { colors, fonts } from '@/constants/theme';
import { iconosDePin } from '@/lib/mapa/colecciones';
import { sitioDeParametro } from '@/lib/mapa/conexiones';
import type { Region } from '@/lib/mapa/encuadre';
import { SIN_FILTROS_MAPA, depurarFiltros, filtrarMapa } from '@/lib/mapa/filtros';
import { agruparLista } from '@/lib/mapa/lista';
import { useBusquedaMapa } from '@/lib/mapa/useBusquedaMapa';
import { useColecciones, usePertenencias, useSitios, useSitiosConPlan } from '@/lib/mapa/useSitios';
import { useEstado } from '@/lib/pareja/EstadoProvider';

type Vista = 'mapa' | 'lista';

/** Pestaña Mapa (docs/plan-mapa.md §5.1): vuestros sitios, en [Mapa | Lista] (en web, solo la Lista). */
export default function Mapa() {
  const router = useRouter();
  const { pareja } = useEstado();
  const { onScroll, sombra } = useScrollCabecera();
  const consulta = useSitios();
  const { refetch } = consulta;
  const conPlan = useSitiosConPlan();
  const { refetch: recargarPlanes } = conPlan;
  const idsConPlan = useMemo(() => new Set(conPlan.data ?? []), [conPlan.data]);
  // Sin elegir nada, abre en la Lista si hay un lector de pantalla activo (el mapa no se puede explorar con él).
  const lector = useQuery({ queryKey: ['lector-pantalla'], queryFn: () => AccessibilityInfo.isScreenReaderEnabled().catch(() => false), staleTime: Infinity });
  const [vistaElegida, setVista] = useState<Vista | null>(null);
  const vista: Vista = vistaElegida ?? (lector.data ? 'lista' : 'mapa');
  const colecciones = useColecciones();
  const pertenencias = usePertenencias();
  const listaColecciones = useMemo(() => colecciones.data ?? [], [colecciones.data]);
  const [elegidos, setFiltros] = useState(SIN_FILTROS_MAPA);
  // Una colección borrada (o que la pareja ha vuelto privada) sale sola del filtro.
  const filtros = useMemo(() => depurarFiltros(elegidos, listaColecciones), [elegidos, listaColecciones]);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  // Última región del mapa (centro de la búsqueda y de «Guardar sitio»): solo se lee en manejadores.
  const region = useRef<Region | null>(null);
  const busqueda = useBusquedaMapa(region);
  const alRegion = (r: Region) => {
    region.current = r;
    busqueda.alMoverse(r);
  };
  // Llegada desde la ficha (`?sitio=<uuid>`): abre el mapa en ese sitio con su tarjeta; el parámetro se usa una vez y se limpia.
  const { sitio: sitioParam, coleccion: coleccionParam } = useLocalSearchParams<{ sitio?: string; coleccion?: string }>();
  const idEnfocar = sitioDeParametro(typeof sitioParam === 'string' ? sitioParam : undefined);
  const [procesado, setProcesado] = useState<string | null>(null);
  const [enfoque, setEnfoque] = useState<{ lat: number; lng: number; clave: number } | null>(null);
  useEffect(() => {
    if (sitioParam && procesado === sitioParam) router.setParams({ sitio: undefined });
  }, [sitioParam, procesado, router]);
  // Llegada desde un plan (`?coleccion=<uuid>`): filtra el mapa por la colección del plan; también se usa una vez.
  const idColeccion = sitioDeParametro(typeof coleccionParam === 'string' ? coleccionParam : undefined);
  const [procesadaColeccion, setProcesadaColeccion] = useState<string | null>(null);
  useEffect(() => {
    if (coleccionParam && procesadaColeccion === coleccionParam) router.setParams({ coleccion: undefined });
  }, [coleccionParam, procesadaColeccion, router]);

  // Al entrar en la pestaña se recarga: no depende solo del tiempo real.
  useFocusEffect(
    useCallback(() => {
      refetch();
      recargarPlanes();
    }, [refetch, recargarPlanes]),
  );

  if (!pareja) return null;
  const todos = consulta.data ?? [];
  if (!sitioParam && procesado !== null) setProcesado(null);
  if (sitioParam && procesado !== sitioParam && (!idEnfocar || consulta.data)) {
    // Sin uuid válido o sitio no visible (la RLS lo oculta): se ignora y se limpia el parámetro.
    const destino = idEnfocar ? todos.find((s) => s.id === idEnfocar) : undefined;
    setProcesado(String(sitioParam));
    if (destino) {
      setVista('mapa');
      setFiltros(SIN_FILTROS_MAPA);
      setSeleccionado(destino.id);
      busqueda.setSeleccionado(null);
      setEnfoque((e) => ({ lat: destino.lat, lng: destino.lng, clave: (e?.clave ?? 0) + 1 }));
    }
  }
  if (!coleccionParam && procesadaColeccion !== null) setProcesadaColeccion(null);
  if (coleccionParam && procesadaColeccion !== coleccionParam && (!idColeccion || colecciones.data)) {
    // Sin uuid válido o colección que no ves: se ignora y se limpia el parámetro.
    setProcesadaColeccion(String(coleccionParam));
    if (idColeccion && listaColecciones.some((c) => c.id === idColeccion)) {
      setVista('mapa');
      setFiltros({ ...SIN_FILTROS_MAPA, colecciones: [idColeccion] });
      setSeleccionado(null);
      busqueda.setSeleccionado(null);
    }
  }
  const sitios = filtrarMapa(todos, filtros, pareja.yo.userId, pertenencias.data);
  const emojis = iconosDePin(sitios, listaColecciones, pertenencias.data ?? [], filtros.colecciones);
  const conMapa = HAY_MAPA && Platform.OS !== 'web';
  // Sin sitios guardados también se enseña el mapa (para buscar en él); con filtros que lo vacían, no.
  const enMapa = conMapa && vista === 'mapa' && (sitios.length > 0 || todos.length === 0);
  // Un sitio que ya no está (borrado por la pareja) cierra la tarjeta sin más.
  const elegido = enMapa ? sitios.find((s) => s.id === seleccionado) : undefined;
  const abrir = (id: string) => router.push({ pathname: '/mapa/sitio/[id]', params: { id } });
  const nuevo = (lat?: number, lng?: number) => {
    const centro = region.current;
    router.push({
      pathname: '/mapa/nuevo',
      params: lat !== undefined && lng !== undefined ? { lat: String(lat), lng: String(lng) } : enMapa && centro ? { cLat: String(centro.latitude), cLng: String(centro.longitude) } : {},
    });
  };
  const cambiarVista = (v: Vista) => {
    setSeleccionado(null);
    busqueda.limpiar();
    setVista(v);
  };

  let cuerpo;
  if (consulta.isError && !consulta.data) {
    cuerpo = (
      <View style={styles.centro}>
        <Text style={styles.vacioTexto}>No se han podido cargar los sitios.</Text>
        <BotonSecundario etiqueta="Reintentar" onPress={() => refetch()} />
      </View>
    );
  } else if (consulta.isLoading || (conMapa && vistaElegida === null && lector.isPending)) {
    cuerpo = null;
  } else if (todos.length === 0 && !enMapa) {
    cuerpo = (
      <View style={styles.centro}>
        <Ionicons name="location-outline" size={44} color={colors.accent} />
        <Text accessibilityRole="header" style={styles.vacioTitulo}>
          Aún no hay sitios
        </Text>
        <Text style={styles.vacioTexto}>Aquí aparecerán los restaurantes, bares y escapadas que queráis probar o donde ya hayáis estado.</Text>
      </View>
    );
  } else if (sitios.length === 0) {
    cuerpo = (
      <View style={styles.centro}>
        <Ionicons name="funnel-outline" size={44} color={colors.accent} />
        <Text accessibilityRole="header" style={styles.vacioTitulo}>
          Sin resultados
        </Text>
        <Text style={styles.vacioTexto}>Ningún sitio cumple los filtros elegidos.</Text>
        <BotonSecundario etiqueta="Quitar filtros" onPress={() => setFiltros(SIN_FILTROS_MAPA)} />
      </View>
    );
  } else if (enMapa) {
    cuerpo = (
      <View style={styles.mapa}>
        <MapaSitios
          sitios={sitios}
          conPlan={idsConPlan}
          emojis={emojis}
          seleccionado={elegido?.id ?? null}
          onSeleccionar={(id) => {
            setSeleccionado(id);
            if (id) busqueda.deseleccionar();
          }}
          onMantener={nuevo}
          resultados={busqueda.resultados}
          resultadoSel={busqueda.seleccionado}
          extra={busqueda.extra}
          onResultado={(id) => {
            if (id) {
              busqueda.elegir(id);
              setSeleccionado(null);
            } else {
              busqueda.deseleccionar();
              busqueda.cerrarSugerencias();
            }
          }}
          onRegion={alRegion}
          enfoque={enfoque}
        />
        <BuscadorMapa b={busqueda} sitios={todos} sinLista={!!elegido} />
        {elegido ? <TarjetaSitio sitio={elegido} pareja={pareja} emoji={emojis.get(elegido.id) ?? null} onFicha={() => abrir(elegido.id)} onCerrar={() => setSeleccionado(null)} /> : null}
      </View>
    );
  } else {
    const grupos = agruparLista(sitios);
    cuerpo = (
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={styles.lista}>
        {grupos.map((g) => (
          <View key={g.estado} style={styles.grupo}>
            <Text accessibilityRole="header" style={styles.grupoTitulo}>
              {g.titulo}
            </Text>
            {g.sitios.map((s, i) => (
              <FilaSitio key={s.id} sitio={s} pareja={pareja} emoji={emojis.get(s.id) ?? null} separador={i < g.sitios.length - 1} onPress={() => abrir(s.id)} />
            ))}
          </View>
        ))}
      </Animated.ScrollView>
    );
  }

  return (
    <View style={styles.raiz}>
      <CabeceraPestana
        titulo="Mapa"
        sombra={sombra}
        cargando={consulta.isLoading || consulta.isRefetching}
        accion={
          <View style={styles.acciones}>
            <Pressable accessibilityRole="button" accessibilityLabel="Mis colecciones" onPress={() => router.push('/mapa/colecciones')} hitSlop={6} style={styles.colecciones}>
              <Ionicons name="albums-outline" size={20} color={colors.icon} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Guardar sitio" onPress={() => nuevo()} hitSlop={6} style={styles.mas}>
              <Ionicons name="add" size={24} color={colors.white} />
            </Pressable>
          </View>
        }
      >
        <View style={styles.barra}>
          {conMapa ? (
            <Segmentado
              compacto
              etiqueta="Vista del mapa"
              opciones={[
                { valor: 'mapa', etiqueta: 'Mapa' },
                { valor: 'lista', etiqueta: 'Lista' },
              ]}
              valor={vista}
              onCambiar={cambiarVista}
            />
          ) : null}
          {todos.length > 0 ? (
            <View style={styles.embudo}>
              <BotonFiltrosMapa valor={filtros} onCambiar={setFiltros} colecciones={listaColecciones} />
            </View>
          ) : null}
        </View>
        <FiltrosActivosMapa valor={filtros} onCambiar={setFiltros} colecciones={listaColecciones} />
      </CabeceraPestana>
      {cuerpo}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colors.background },
  acciones: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colecciones: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  mas: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  barra: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  embudo: { marginLeft: 'auto' },
  mapa: { flex: 1 },
  lista: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 20 },
  grupo: { gap: 2 },
  grupoTitulo: { fontFamily: fonts.title, fontSize: 18, color: colors.text, marginBottom: 2 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32, paddingBottom: 60 },
  vacioTitulo: { fontFamily: fonts.title, fontSize: 22, color: colors.text, textAlign: 'center' },
  vacioTexto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary, textAlign: 'center' },
});
