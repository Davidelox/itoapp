import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BorrarGasto } from '@/components/gastos/BorrarGasto';
import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { EmojiIcono } from '@/components/mapa/EmojiIcono';
import { BotonPrincipal, BotonSecundario } from '@/components/onboarding/Botones';
import { DineroDelPlan } from '@/components/planificador/BarraPresupuesto';
import { colors, fonts, radius } from '@/constants/theme';
import { formatearImporte } from '@/lib/dinero/importe';
import { hoyISO } from '@/lib/gastos/fechas';
import { personas } from '@/lib/gastos/personas';
import { totalGastadoDelPlan } from '@/lib/gastos/planes';
import { useGastosPlan } from '@/lib/gastos/useGastos';
import { useColecciones, usePertenencias, useSitios } from '@/lib/mapa/useSitios';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { etiquetaTipo, textoFechas } from '@/lib/planificador/plan';
import { parametrosDePlan } from '@/lib/planificador/precarga';
import { itinerarioResumido, puestoPor, sitiosVisitados } from '@/lib/planificador/resumen';
import { contadorTareas } from '@/lib/planificador/tareas';
import { usePlan, useItinerario, useTareas } from '@/lib/planificador/usePlanificador';

/**
 * Resumen de un plan terminado (solo lectura, docs/plan-planificador.md §F10): fechas, gasto frente a presupuesto, cuánto puso
 * cada uno, tareas hechas, sitios visitados e itinerario. «Duplicar plan» abre un plan nuevo con lo reutilizable.
 */
export default function ResumenPlan() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pareja } = useEstado();
  const { plan, isLoading, isError, refetch, data } = usePlan(id);
  const gastos = useGastosPlan(id);
  const tareas = useTareas();
  const itinerario = useItinerario();
  const sitios = useSitios();
  const colecciones = useColecciones();
  const pertenencias = usePertenencias();
  const hoy = hoyISO();
  const volver = () => (router.canGoBack() ? router.back() : router.replace('/planificador'));
  const cabecera = (
    <View style={[styles.barra, { paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={volver} style={styles.redondo}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.barraTitulo}>
        Resumen
      </Text>
      <View style={styles.redondo} />
    </View>
  );

  if (!pareja || isLoading) {
    return (
      <View style={styles.raiz}>
        {cabecera}
        <CargandoHilo size="large" color={colors.accent} style={{ marginTop: 40 }} />
      </View>
    );
  }
  if (!plan) {
    return isError && !data ? (
      <View style={styles.raiz}>
        {cabecera}
        <View style={styles.centro}>
          <Text style={styles.texto}>No se ha podido cargar el plan.</Text>
          <BotonSecundario etiqueta="Reintentar" onPress={() => refetch()} />
        </View>
      </View>
    ) : (
      <Redirect href="/planificador" />
    );
  }

  const p = personas(pareja);
  const gastado = plan.gastado_cents ?? (gastos.data ? totalGastadoDelPlan(gastos.data) : null);
  const puesto = gastos.data ? puestoPor(gastos.data, p.yo.slot) : null;
  const hechas = contadorTareas((tareas.data ?? []).filter((t) => t.plan_id === plan.id));
  const coleccion = colecciones.data?.find((c) => c.plan_id === plan.id)?.id ?? null;
  const visitados = sitiosVisitados(coleccion, sitios.data ?? [], pertenencias.data ?? []);
  const { lineas, fuera } = itinerarioResumido((itinerario.data ?? []).filter((e) => e.plan_id === plan.id), plan.start_date, plan.end_date);
  const aviso = (texto: string) => <Text style={styles.ayuda}>{texto}</Text>;
  const error = (texto: string, reintentar: () => void) => (
    <View style={styles.errorFila}>
      <Text style={styles.ayuda}>{texto}</Text>
      <Pressable accessibilityRole="button" onPress={reintentar} style={styles.reintentar}>
        <Text style={styles.reintentarTexto}>Reintentar</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.raiz}>
      {cabecera}
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 32 }]}>
        <BorrarGasto gasto={{ id: plan.id, visible_to_partner: true }} pareja={pareja} tipo="plan" parte="banda" />

        <View style={styles.hero}>
          <View style={styles.emoji}>
            <EmojiIcono emoji={plan.icon} size={40} />
          </View>
          <Text accessibilityRole="header" style={styles.titulo}>
            {plan.name}
          </Text>
          <Text style={styles.fechas}>{textoFechas(plan.start_date, plan.end_date, hoy)}</Text>
          <Text style={styles.tipo}>{plan.destination ? `${etiquetaTipo(plan.type)} · ${plan.destination}` : etiquetaTipo(plan.type)}</Text>
        </View>

        <View style={styles.seccion}>
          <Text accessibilityRole="header" style={styles.seccionTitulo}>
            Gasto
          </Text>
          <DineroDelPlan presupuestoCents={plan.budget_cents} gastadoCents={gastado} tamano="grande" />
          {gastos.isError ? (
            error('No se ha podido cargar quién pagó.', () => gastos.refetch())
          ) : puesto ? (
            puesto.yo + puesto.pareja + puesto.bote === 0 ? (
              aviso('Este plan no tuvo gastos.')
            ) : (
              <View style={styles.puesto}>
                <FilaPuesto nombre="Tú" cents={puesto.yo} tinta={p.tintaYo} />
                {p.otra ? <FilaPuesto nombre={p.nombrePareja} cents={puesto.pareja} tinta={p.tintaPareja} /> : null}
                {puesto.bote > 0 ? <FilaPuesto nombre="Bote común" cents={puesto.bote} tinta={colors.text} /> : null}
              </View>
            )
          ) : null}
        </View>

        <View style={styles.seccion}>
          <Text accessibilityRole="header" style={styles.seccionTitulo}>
            Tareas
          </Text>
          {tareas.isError ? error('No se han podido cargar las tareas.', () => tareas.refetch()) : <Text style={styles.dato}>{hechas ?? 'No hubo tareas.'}</Text>}
        </View>

        <View style={styles.seccion}>
          <Text accessibilityRole="header" style={styles.seccionTitulo}>
            Sitios visitados
          </Text>
          {sitios.isError || colecciones.isError || pertenencias.isError ? (
            error('No se han podido cargar los sitios.', () => Promise.all([sitios.refetch(), colecciones.refetch(), pertenencias.refetch()]))
          ) : visitados.length === 0 ? (
            aviso('Ningún sitio del plan está en «Hemos ido».')
          ) : (
            visitados.map((s) => (
              <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={`${s.name}, hemos ido`} onPress={() => router.push({ pathname: '/mapa/sitio/[id]', params: { id: s.id } })} style={styles.sitio}>
                <Ionicons name="location-outline" size={18} color={colors.icon} />
                <Text style={styles.sitioNombre} numberOfLines={1}>
                  {s.name}
                </Text>
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.seccion}>
          <Text accessibilityRole="header" style={styles.seccionTitulo}>
            Itinerario
          </Text>
          {itinerario.isError ? (
            error('No se ha podido cargar el itinerario.', () => itinerario.refetch())
          ) : lineas.length === 0 && fuera === 0 ? (
            aviso('No hubo itinerario.')
          ) : (
            <>
              {lineas.map((l) => (
                <View key={l.fecha} style={styles.dia} accessible accessibilityLabel={`${l.titulo}: ${l.detalle}`}>
                  <Text style={styles.diaTitulo}>{l.titulo}</Text>
                  <Text style={styles.diaDetalle}>{l.detalle}</Text>
                </View>
              ))}
              {fuera > 0 ? aviso(fuera === 1 ? 'Y 1 elemento fuera de las fechas del plan.' : `Y ${fuera} elementos fuera de las fechas del plan.`) : null}
            </>
          )}
        </View>

        <BotonPrincipal etiqueta="Duplicar plan" onPress={() => router.push({ pathname: '/planificador/nuevo', params: parametrosDePlan(plan) })} />
        <BotonSecundario etiqueta="Abrir el plan" onPress={() => router.push({ pathname: '/planificador/[id]', params: { id: plan.id } })} />
        <BorrarGasto gasto={{ id: plan.id, visible_to_partner: true }} pareja={pareja} tipo="plan" parte="pie" />
      </ScrollView>
    </View>
  );
}

function FilaPuesto({ nombre, cents, tinta }: { nombre: string; cents: number; tinta: string }) {
  return (
    <View style={styles.puestoFila} accessible accessibilityLabel={`${nombre} puso ${formatearImporte(cents)}`}>
      <Text style={[styles.puestoNombre, { color: tinta }]}>{nombre}</Text>
      <Text style={styles.puestoImporte}>{formatearImporte(cents)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colors.background },
  barra: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  barraTitulo: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  redondo: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32, paddingBottom: 60 },
  texto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary, textAlign: 'center' },
  contenido: { paddingHorizontal: 20, gap: 16 },
  hero: { alignItems: 'center', gap: 6, padding: 20, borderRadius: radius.xl, backgroundColor: colors.accentSoft },
  emoji: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  titulo: { fontFamily: fonts.title, fontSize: 26, color: colors.text, textAlign: 'center' },
  fechas: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text, textAlign: 'center' },
  tipo: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  seccion: { gap: 10, padding: 16, borderRadius: radius.xl - 4, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  seccionTitulo: { fontFamily: fonts.title, fontSize: 18, color: colors.text },
  ayuda: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  dato: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  errorFila: { gap: 4 },
  reintentar: { minHeight: 44, justifyContent: 'center' },
  reintentarTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.accent },
  puesto: { gap: 6 },
  puestoFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  puestoNombre: { fontFamily: fonts.bodyBold, fontSize: 15 },
  puestoImporte: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  sitio: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sitioNombre: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  dia: { gap: 2 },
  diaTitulo: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  diaDetalle: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
});
