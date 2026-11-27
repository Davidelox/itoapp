import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { EmojiIcono } from '@/components/mapa/EmojiIcono';
import { BotonSecundario } from '@/components/onboarding/Botones';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { hoyISO } from '@/lib/gastos/fechas';
import { etiquetaPasado, mesYAnio, pasados, textoGastado } from '@/lib/planificador/resumen';
import { usePlanes } from '@/lib/planificador/usePlanificador';

/** Pestaña «Pasados» (mockup Planificador): planes terminados, del más reciente al más antiguo, con lo gastado y «Ver resumen». */
export function ListaPasados({ onScroll }: { onScroll: React.ComponentProps<typeof Animated.ScrollView>['onScroll'] }) {
  const colors = useColores();
  const styles = useStyles();
  const router = useRouter();
  const consulta = usePlanes();
  const [recargando, setRecargando] = useState(false);

  if (consulta.isError && !consulta.data) {
    return (
      <View style={styles.centro}>
        <Text style={styles.vacioTexto}>No se han podido cargar los planes.</Text>
        <BotonSecundario etiqueta="Reintentar" onPress={() => consulta.refetch()} />
      </View>
    );
  }
  if (consulta.isLoading) return null;

  const lista = pasados(consulta.data ?? [], hoyISO());
  if (lista.length === 0) {
    return (
      <View style={styles.centro}>
        <Ionicons name="time-outline" size={44} color={colors.accent} />
        <Text accessibilityRole="header" style={styles.vacioTitulo}>
          Aún no hay planes pasados
        </Text>
        <Text style={styles.vacioTexto}>Aquí aparecerán los planes que ya han terminado, con lo que gastasteis.</Text>
      </View>
    );
  }

  const recargar = async () => {
    setRecargando(true);
    await consulta.refetch();
    setRecargando(false);
  };

  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      refreshControl={<RefreshControl refreshing={recargando} onRefresh={recargar} tintColor={colors.accent} />}
      contentContainerStyle={styles.lista}
    >
      {lista.map((p) => {
        const gastado = textoGastado(p.gastado_cents);
        return (
          <View key={p.id} style={styles.tarjeta}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={etiquetaPasado(p)}
              accessibilityHint="Abre el plan"
              onPress={() => router.push({ pathname: '/planificador/[id]', params: { id: p.id } })}
              style={({ pressed }) => [styles.cabecera, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.baldosa}>
                <EmojiIcono emoji={p.icon} size={26} />
              </View>
              <View style={styles.textos}>
                <Text style={styles.nombre} numberOfLines={2}>
                  {p.name}
                </Text>
                <Text style={styles.fecha}>{mesYAnio(p.end_date)}</Text>
              </View>
              {gastado ? <Text style={styles.gastado}>{gastado}</Text> : null}
            </Pressable>
            <BotonSecundario etiqueta="Ver resumen" onPress={() => router.push({ pathname: '/planificador/[id]/resumen', params: { id: p.id } })} />
          </View>
        );
      })}
    </Animated.ScrollView>
  );
}

const useStyles = crearEstilos((colors) => ({
  lista: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, gap: 12 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32, paddingBottom: 60 },
  vacioTitulo: { fontFamily: fonts.title, fontSize: 22, color: colors.text, textAlign: 'center' },
  vacioTexto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary, textAlign: 'center' },
  tarjeta: { gap: 12, padding: 14, borderRadius: radius.xl - 4, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  baldosa: { width: 48, height: 48, borderRadius: radius.lg, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  textos: { flex: 1, minWidth: 0, gap: 2 },
  nombre: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  fecha: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  gastado: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
}));
