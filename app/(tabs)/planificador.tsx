import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { CabeceraPestana, useScrollCabecera } from '@/components/CabeceraPestana';
import { BotonSecundario } from '@/components/onboarding/Botones';
import { Segmentado } from '@/components/onboarding/OpcionRadio';
import { ListaIdeas } from '@/components/planificador/ListaIdeas';
import { ListaPasados } from '@/components/planificador/ListaPasados';
import { TarjetaPlan } from '@/components/planificador/TarjetaPlan';
import { colors, fonts } from '@/constants/theme';
import { hoyISO } from '@/lib/gastos/fechas';
import { proximos } from '@/lib/planificador/plan';
import { personas } from '@/lib/gastos/personas';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { tareasPorPlan } from '@/lib/planificador/tareas';
import { usePlanes, useTareas } from '@/lib/planificador/usePlanificador';

type Vista = 'proximos' | 'ideas' | 'pasados';

/** Pestaña Planificador (docs/plan-planificador.md §5): planes próximos y en curso, Ideas y Pasados. */
export default function Planificador() {
  const router = useRouter();
  const { onScroll, sombra } = useScrollCabecera();
  const consulta = usePlanes();
  const { pareja } = useEstado();
  const porPlan = tareasPorPlan(useTareas().data ?? []);
  const { refetch } = consulta;
  const [vista, setVista] = useState<Vista>('proximos');
  const [recargando, setRecargando] = useState(false);
  const hoy = hoyISO();
  const lista = proximos(consulta.data ?? [], hoy);
  const nuevo = () => router.push('/planificador/nuevo');
  const recargar = async () => {
    setRecargando(true);
    await refetch();
    setRecargando(false);
  };

  let cuerpo;
  if (vista === 'ideas') {
    cuerpo = pareja ? <ListaIdeas pareja={pareja} onScroll={onScroll} /> : null;
  } else if (vista === 'pasados') {
    cuerpo = <ListaPasados onScroll={onScroll} />;
  } else if (consulta.isError && !consulta.data) {
    cuerpo = (
      <View style={styles.centro}>
        <Text style={styles.vacioTexto}>No se han podido cargar los planes.</Text>
        <BotonSecundario etiqueta="Reintentar" onPress={() => refetch()} />
      </View>
    );
  } else if (consulta.isLoading) {
    cuerpo = null;
  } else if (lista.length === 0) {
    cuerpo = (
      <View style={styles.centro}>
        <Ionicons name="briefcase-outline" size={44} color={colors.accent} />
        <Text accessibilityRole="header" style={styles.vacioTitulo}>
          Aún no tenéis planes
        </Text>
        <Text style={styles.vacioTexto}>Una escapada, un cumpleaños, una mudanza: crea un plan y reunidlo todo en un sitio.</Text>
        <BotonSecundario etiqueta="Crear un plan" onPress={nuevo} />
      </View>
    );
  } else {
    cuerpo = (
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={recargar} tintColor={colors.accent} />}
        contentContainerStyle={styles.lista}
      >
        {lista.map((p) => (
          <TarjetaPlan key={p.id} plan={p} tareas={porPlan.get(p.id) ?? []} yo={pareja?.yo.slot ?? 'm1'} tintaYo={pareja ? personas(pareja).tintaYo : colors.text} hoy={hoy} onPress={() => router.push({ pathname: '/planificador/[id]', params: { id: p.id } })} />
        ))}
      </Animated.ScrollView>
    );
  }

  return (
    <View style={styles.raiz}>
      <CabeceraPestana
        titulo="Planificador"
        sombra={sombra}
        cargando={consulta.isLoading || consulta.isRefetching}
        accion={
          <Pressable accessibilityRole="button" accessibilityLabel="Nuevo plan" onPress={nuevo} hitSlop={6} style={styles.mas}>
            <Ionicons name="add" size={24} color={colors.white} />
          </Pressable>
        }
      >
        <Text style={styles.subtitulo}>Viajes, celebraciones y otros planes</Text>
        <Segmentado
          etiqueta="Qué planes ver"
          opciones={[
            { valor: 'proximos', etiqueta: 'Próximos' },
            { valor: 'ideas', etiqueta: 'Ideas' },
            { valor: 'pasados', etiqueta: 'Pasados' },
          ]}
          valor={vista}
          onCambiar={setVista}
        />
      </CabeceraPestana>
      {cuerpo}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colors.background },
  mas: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  subtitulo: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
  lista: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, gap: 12 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32, paddingBottom: 60 },
  vacioTitulo: { fontFamily: fonts.title, fontSize: 22, color: colors.text, textAlign: 'center' },
  vacioTexto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary, textAlign: 'center' },
});
