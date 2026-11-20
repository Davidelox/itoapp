import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { CabeceraPestana, useScrollCabecera } from '@/components/CabeceraPestana';
import { BotonFiltrosMapa, FiltrosActivosMapa } from '@/components/mapa/FiltrosMapa';
import { FilaSitio } from '@/components/mapa/FilaSitio';
import { HAY_MAPA, MapaSitios } from '@/components/mapa/MapaSitios';
import { TarjetaSitio } from '@/components/mapa/TarjetaSitio';
import { BotonSecundario } from '@/components/onboarding/Botones';
import { Segmentado } from '@/components/onboarding/OpcionRadio';
import { colors, fonts } from '@/constants/theme';
import { SIN_FILTROS_MAPA, filtrarMapa } from '@/lib/mapa/filtros';
import { agruparLista } from '@/lib/mapa/lista';
import { useSitios, useSitiosConPlan } from '@/lib/mapa/useSitios';
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
  const [filtros, setFiltros] = useState(SIN_FILTROS_MAPA);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  // Al entrar en la pestaña se recarga: no depende solo del tiempo real.
  useFocusEffect(
    useCallback(() => {
      refetch();
      recargarPlanes();
    }, [refetch, recargarPlanes]),
  );

  if (!pareja) return null;
  const todos = consulta.data ?? [];
  const sitios = filtrarMapa(todos, filtros, pareja.yo.userId);
  const conMapa = HAY_MAPA && Platform.OS !== 'web';
  const enMapa = conMapa && vista === 'mapa' && sitios.length > 0;
  // Un sitio que ya no está (borrado por la pareja) cierra la tarjeta sin más.
  const elegido = enMapa ? sitios.find((s) => s.id === seleccionado) : undefined;
  const abrir = (id: string) => router.push({ pathname: '/mapa/sitio/[id]', params: { id } });
  const nuevo = (lat?: number, lng?: number) =>
    router.push({ pathname: '/mapa/nuevo', params: lat !== undefined && lng !== undefined ? { lat: String(lat), lng: String(lng) } : {} });
  const cambiarVista = (v: Vista) => {
    setSeleccionado(null);
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
  } else if (todos.length === 0) {
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
        <MapaSitios sitios={sitios} conPlan={idsConPlan} seleccionado={elegido?.id ?? null} onSeleccionar={setSeleccionado} onMantener={nuevo} />
        {elegido ? <TarjetaSitio sitio={elegido} pareja={pareja} onFicha={() => abrir(elegido.id)} onCerrar={() => setSeleccionado(null)} /> : null}
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
              <FilaSitio key={s.id} sitio={s} pareja={pareja} separador={i < g.sitios.length - 1} onPress={() => abrir(s.id)} />
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
          <Pressable accessibilityRole="button" accessibilityLabel="Guardar sitio" onPress={() => nuevo()} hitSlop={6} style={styles.mas}>
            <Ionicons name="add" size={24} color={colors.white} />
          </Pressable>
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
              <BotonFiltrosMapa valor={filtros} onCambiar={setFiltros} />
            </View>
          ) : null}
        </View>
        <FiltrosActivosMapa valor={filtros} onCambiar={setFiltros} />
      </CabeceraPestana>
      {cuerpo}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colors.background },
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
