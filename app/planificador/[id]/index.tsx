import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { EmojiIcono } from '@/components/mapa/EmojiIcono';
import { BotonSecundario } from '@/components/onboarding/Botones';
import { BorrarGasto } from '@/components/gastos/BorrarGasto';
import { BarraPresupuesto } from '@/components/planificador/BarraPresupuesto';
import { Itinerario } from '@/components/planificador/Itinerario';
import { GastosPlan } from '@/components/planificador/GastosPlan';
import { ListaTareas } from '@/components/planificador/ListaTareas';
import { SitiosDelPlan } from '@/components/planificador/SitiosDelPlan';
import { colors, fonts, radius } from '@/constants/theme';
import { hoyISO } from '@/lib/gastos/fechas';
import { cuentaAtras, etiquetaTipo, textoFechas, vistaPresupuesto } from '@/lib/planificador/plan';
import { usePlan, useTareas } from '@/lib/planificador/usePlanificador';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/**
 * Detalle de un plan: cabecera con su icono, fechas y cuenta atrás, «Editar», «En el calendario», tareas, presupuesto,
 * gastos del plan con su saldo, notas y «Pedir borrar este plan». El itinerario (F6) va entre las tareas y el presupuesto.
 */
export default function DetallePlan() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pareja, userId } = useEstado();
  const tareas = useTareas();
  const { plan, isLoading, isError, refetch, data } = usePlan(id);
  const hoy = hoyISO();
  const volver = () => (router.canGoBack() ? router.back() : router.replace('/planificador'));
  const cabecera = (
    <View style={[styles.barra, { paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={volver} style={styles.redondo}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      {plan ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Editar plan"
          onPress={() => router.push({ pathname: '/planificador/[id]/editar', params: { id: plan.id } })}
          style={styles.editar}
        >
          <Ionicons name="create-outline" size={18} color={colors.text} />
          <Text style={styles.editarTexto}>Editar</Text>
        </Pressable>
      ) : (
        <View style={styles.redondo} />
      )}
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
    // Borrado (aquí o por la pareja) o que no existe.
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

  const cuenta = cuentaAtras(plan, hoy);
  const vista = vistaPresupuesto(plan.budget_cents, plan.gastado_cents);
  const lineaCuenta = cuenta.startsWith('En ') ? `en ${cuenta.slice(3)}` : cuenta.toLowerCase();

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
          <Text style={styles.fechas}>
            {textoFechas(plan.start_date, plan.end_date, hoy)} · {lineaCuenta}
          </Text>
          <Text style={styles.tipo}>{plan.destination ? `${etiquetaTipo(plan.type)} · ${plan.destination}` : etiquetaTipo(plan.type)}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ver en el calendario"
          onPress={() => router.dismissTo({ pathname: '/calendario', params: { dia: plan.start_date, evento: plan.id } })}
          style={styles.calendario}
        >
          <Ionicons name="calendar-outline" size={20} color={colors.accent} />
          <Text style={styles.calendarioTexto}>En el calendario</Text>
        </Pressable>

        {userId ? <ListaTareas plan={plan} tareas={(tareas.data ?? []).filter((t) => t.plan_id === plan.id)} pareja={pareja} userId={userId} /> : null}

        <Itinerario plan={plan} pareja={pareja} />

        <SitiosDelPlan plan={plan} pareja={pareja} />

        <View style={styles.seccion}>
          <Text accessibilityRole="header" style={styles.seccionTitulo}>
            Presupuesto
          </Text>
          <BarraPresupuesto vista={vista} tamano="grande" />
        </View>

        <GastosPlan plan={plan} pareja={pareja} />

        {plan.notes ? (
          <View style={styles.seccion}>
            <Text accessibilityRole="header" style={styles.seccionTitulo}>
              Notas
            </Text>
            <Text style={styles.notas}>{plan.notes}</Text>
          </View>
        ) : null}

        <BorrarGasto gasto={{ id: plan.id, visible_to_partner: true }} pareja={pareja} tipo="plan" parte="pie" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colors.background },
  barra: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  redondo: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  editar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14 },
  editarTexto: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32, paddingBottom: 60 },
  texto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary, textAlign: 'center' },
  contenido: { paddingHorizontal: 20, gap: 16 },
  hero: { alignItems: 'center', gap: 6, padding: 20, borderRadius: radius.xl, backgroundColor: colors.accentSoft },
  emoji: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  titulo: { fontFamily: fonts.title, fontSize: 26, color: colors.text, textAlign: 'center' },
  fechas: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text, textAlign: 'center' },
  tipo: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  calendario: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  calendarioTexto: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.accent },
  seccion: { gap: 10, padding: 16, borderRadius: radius.xl - 4, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  seccionTitulo: { fontFamily: fonts.title, fontSize: 18, color: colors.text },
  notas: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.icon },
});
