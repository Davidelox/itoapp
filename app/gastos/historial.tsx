import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { Chip } from '@/components/gastos/Controles';
import { FilaGasto } from '@/components/gastos/FilaGasto';
import { FilaPlanGasto } from '@/components/gastos/FilaPlanGasto';
import { BotonSecundario } from '@/components/onboarding/Botones';
import { colors, fonts, radius } from '@/constants/theme';
import { formatearImporte } from '@/lib/dinero/importe';
import { CATEGORIAS, type Categoria, INFO_CATEGORIA } from '@/lib/gastos/categorias';
import { type FilaLista, agruparPorPlan } from '@/lib/gastos/agrupar';
import type { Gasto } from '@/lib/gastos/consultas';
import { personas } from '@/lib/gastos/personas';
import { ESTADO_PAGO, NOMBRE_METODO, type Pago, textoPago } from '@/lib/gastos/saldar';
import { aISO, fechaCorta, nombreMes } from '@/lib/gastos/fechas';
import { useHistorial, usePagos, useResumenesPlanes, useTotales } from '@/lib/gastos/useGastos';
import { useEstado } from '@/lib/pareja/EstadoProvider';

const ESPERA_BUSQUEDA_MS = 300;

type Elemento =
  | { tipo: 'mes'; clave: string; titulo: string }
  | { tipo: 'gasto'; clave: string; gasto: Gasto }
  | { tipo: 'plan'; clave: string; fila: Extract<FilaLista<Gasto>, { tipo: 'plan' }> }
  | { tipo: 'pago'; clave: string; pago: Pago };

/** Historial (mockup HistorialGastos): buscador, filtro por categoría, meses y carga por páginas de 50. */
export default function Historial() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pareja } = useEstado();
  const { ver } = useLocalSearchParams<{ ver?: string }>();
  // «Pagos» es un filtro más (mockup HistorialGastos): lista las liquidaciones en vez de los gastos.
  const [verPagos, setVerPagos] = useState(ver === 'pagos');
  const pagos = usePagos(verPagos);
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<Categoria | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto), ESPERA_BUSQUEDA_MS);
    return () => clearTimeout(t);
  }, [texto]);

  const filtros = { categoria, texto: busqueda };
  const historial = useHistorial(filtros);
  const totales = useTotales(filtros);
  const resumenes = useResumenesPlanes();
  // Con un filtro (categoría o texto) no se agrupa: el total del plan incluiría gastos que el filtro excluye y no cuadraría con el total de arriba.
  const agrupar = !categoria && !busqueda.trim();

  const elementos = useMemo<Elemento[]>(() => {
    const lista: Elemento[] = [];
    if (verPagos) {
      let mesPago = '';
      for (const pg of pagos.data ?? []) {
        const iso = aISO(new Date(pg.created_at));
        if (iso.slice(0, 7) !== mesPago) {
          lista.push({ tipo: 'mes', clave: `mes-${iso.slice(0, 7)}`, titulo: nombreMes(iso) });
          mesPago = iso.slice(0, 7);
        }
        lista.push({ tipo: 'pago', clave: pg.id, pago: pg });
      }
      return lista;
    }
    let mes = '';
    const vistos = new Set<string>();
    const sinRepetir: Gasto[] = [];
    for (const g of historial.data?.pages.flat() ?? []) {
      // Paginación por desplazamiento: si entra un gasto nuevo mientras se baja, una fila se repite.
      if (vistos.has(g.id)) continue;
      vistos.add(g.id);
      sinRepetir.push(g);
    }
    // Un plan = una fila, en el mes de su gasto más reciente cargado; sus gastos de páginas posteriores se absorben en ella.
    for (const f of agruparPorPlan(sinRepetir, agrupar ? resumenes.data : null)) {
      const fecha = f.tipo === 'plan' ? f.fecha : f.gasto.spent_on;
      const m = fecha.slice(0, 7);
      if (m !== mes) {
        lista.push({ tipo: 'mes', clave: `mes-${m}`, titulo: nombreMes(fecha) });
        mes = m;
      }
      lista.push(f.tipo === 'plan' ? { tipo: 'plan', clave: `plan-${f.plan.id}`, fila: f } : { tipo: 'gasto', clave: f.gasto.id, gasto: f.gasto });
    }
    return lista;
  }, [historial.data, pagos.data, verPagos, agrupar, resumenes.data]);

  const volver = () => (router.canGoBack() ? router.back() : router.replace('/gastos'));
  if (!pareja) return null;

  const cuantos = verPagos ? pagos.data?.length : totales.data?.cuantos;
  const resumen = verPagos ? (
    cuantos === undefined ? null : (
      <View style={styles.resumen}>
        <Text style={styles.resumenCuantos}>
          {cuantos} {cuantos === 1 ? 'pago' : 'pagos'}
        </Text>
      </View>
    )
  ) : cuantos === undefined ? null : (
      <View style={styles.resumen} accessible accessibilityLiveRegion="polite">
        <Text style={styles.resumenCuantos}>
          {cuantos} {cuantos === 1 ? 'gasto' : 'gastos'}
        </Text>
        <Text style={styles.resumenTotal}>
          Total <Text style={styles.resumenImporte}>{formatearImporte(totales.data?.totalCents ?? 0)}</Text>
        </Text>
      </View>
    );

  return (
    <View style={styles.raiz}>
      <View style={[styles.cabecera, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={volver} style={styles.redondo}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.titulo}>
          Historial
        </Text>
        <View style={styles.hueco} />
      </View>

      <View style={styles.filtros}>
        <View style={styles.buscador}>
          <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.lupa} />
          <TextInput
            accessibilityLabel="Buscar en el historial"
            value={texto}
            onChangeText={setTexto}
            placeholder="Buscar gasto o categoría"
            placeholderTextColor={colors.textSecondary}
            returnKeyType="search"
            autoCorrect={false}
            style={styles.buscadorCampo}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Filtrar por categoría">
          <Chip
            etiqueta="Todos"
            rol="radio"
            activo={categoria === null && !verPagos}
            onPress={() => {
              setCategoria(null);
              setVerPagos(false);
            }}
          />
          {CATEGORIAS.map((c) => (
            <Chip
              key={c}
              etiqueta={INFO_CATEGORIA[c].nombre}
              rol="radio"
              activo={categoria === c && !verPagos}
              onPress={() => {
                setCategoria(c);
                setVerPagos(false);
              }}
            />
          ))}
          <Chip etiqueta="Pagos" rol="radio" activo={verPagos} onPress={() => setVerPagos(true)} />
        </ScrollView>
        {resumen}
      </View>

      {(verPagos ? pagos.isLoading : historial.isLoading) ? (
        <CargandoHilo color={colors.accent} style={{ marginTop: 32 }} />
      ) : (verPagos ? pagos.isError : historial.isError) ? (
        <View style={styles.vacio}>
          <Text style={styles.vacioTexto}>No se ha podido cargar el historial.</Text>
          <BotonSecundario etiqueta="Reintentar" onPress={() => (verPagos ? pagos.refetch() : historial.refetch())} />
        </View>
      ) : (
        <FlatList
          data={elementos}
          keyExtractor={(e) => e.clave}
          contentContainerStyle={[styles.lista, { paddingBottom: insets.bottom + 24 }]}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (!verPagos && historial.hasNextPage && !historial.isFetchingNextPage) historial.fetchNextPage();
          }}
          ListEmptyComponent={
            <Text style={styles.vacioTexto}>
              {verPagos
                ? 'Aún no habéis saldado nada.'
                : busqueda.trim() || categoria
                  ? 'No hay nada que coincida con esa búsqueda.'
                  : 'Aún no hay gastos.'}
            </Text>
          }
          ListFooterComponent={historial.isFetchingNextPage ? <CargandoHilo color={colors.accent} style={{ marginVertical: 16 }} /> : undefined}
          renderItem={({ item }) =>
            item.tipo === 'mes' ? (
              <Text accessibilityRole="header" style={styles.mes}>
                {item.titulo.toUpperCase()}
              </Text>
            ) : item.tipo === 'pago' ? (
              <FilaPago pago={item.pago} onPress={() => router.push({ pathname: '/gastos/pago/[id]', params: { id: item.pago.id } })} />
            ) : item.tipo === 'plan' ? (
              <View style={styles.tarjeta}>
                <FilaPlanGasto fila={item.fila} conFecha onPress={() => router.push({ pathname: '/planificador/[id]', params: { id: item.fila.plan.id } })} />
              </View>
            ) : (
              <View style={styles.tarjeta}>
                <FilaGasto
                  gasto={item.gasto}
                  pareja={pareja}
                  conFecha
                  onPress={() => router.push({ pathname: '/gastos/[id]', params: { id: item.gasto.id } })}
                />
              </View>
            )
          }
        />
      )}
    </View>
  );
}

function FilaPago({ pago, onPress }: { pago: Pago; onPress: () => void }) {
  const { pareja } = useEstado();
  if (!pareja) return null;
  const p = personas(pareja);
  const fecha = fechaCorta(aISO(new Date(pago.created_at)));
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.pago, pressed && { opacity: 0.6 }]}>
      <View style={styles.pagoIcono}>
        <Ionicons name="swap-horizontal" size={20} color={colors.icon} />
      </View>
      <View style={styles.pagoTextos}>
        <Text style={styles.pagoTitulo}>{textoPago(pago, p.yo.slot, p.nombrePareja)}</Text>
        <Text style={styles.pagoSub}>
          {NOMBRE_METODO[pago.method]} · {fecha} · {ESTADO_PAGO[pago.status]}
        </Text>
      </View>
      <Text style={styles.pagoEtiqueta}>Pago</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pago: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginBottom: 6,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#B9B2A4',
    backgroundColor: colors.white,
  },
  pagoIcono: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  pagoTextos: { flex: 1, gap: 2 },
  pagoTitulo: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  pagoSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
  pagoEtiqueta: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.icon },
  raiz: { flex: 1, backgroundColor: colors.background },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  redondo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hueco: { width: 44 },
  titulo: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  filtros: { paddingHorizontal: 20, paddingTop: 4, gap: 10 },
  buscador: { justifyContent: 'center' },
  lupa: { position: 'absolute', left: 14, zIndex: 1 },
  buscadorCampo: {
    height: 48,
    paddingLeft: 44,
    paddingRight: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.white,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
  },
  chips: { gap: 8, paddingBottom: 2 },
  resumen: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  resumenCuantos: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textSecondary },
  resumenTotal: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  resumenImporte: { fontFamily: fonts.title, fontSize: 20, color: colors.text },
  lista: { paddingHorizontal: 20, paddingTop: 4 },
  mes: { marginTop: 14, marginBottom: 6, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.textSecondary },
  tarjeta: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  vacio: { alignItems: 'center', gap: 12, padding: 32 },
  vacioTexto: { marginTop: 40, textAlign: 'center', fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary },
});
