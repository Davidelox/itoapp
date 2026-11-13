import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HiloRecogido } from '@/components/hilo/TirarDelHilo';
import { colors, fonts, fontSizes, radius, spacing } from '@/constants/theme';

export default function Detalle() {
  const { titulo, tipo, detalle } = useLocalSearchParams<{ titulo?: string; tipo?: string; detalle?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reducida = useReducedMotion();
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withTiming(1, { duration: reducida ? 200 : 360, easing: Easing.out(Easing.cubic) });
  }, [p, reducida]);

  // Aparece desde abajo con un fundido (con movimiento reducido, solo fundido).
  const estilo = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: reducida ? [] : [{ translateY: (1 - p.value) * 48 }, { scale: 0.96 + 0.04 * p.value }],
  }));

  return (
    <View style={styles.pantalla}>
      <Animated.View style={[styles.contenido, { paddingTop: insets.top + spacing.xxl + 100 }, estilo]}>
        <Text style={styles.tipo}>{tipo ?? 'Detalle'}</Text>
        <Text style={styles.titulo}>{titulo ?? 'Detalle de ejemplo'}</Text>
        <Text style={styles.texto}>{detalle ?? 'Esta pantalla aparece al tirar del hilo de una tarjeta.'}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={({ pressed }) => [styles.boton, pressed && { backgroundColor: colors.accentDark }]}
        >
          <Text style={styles.botonTexto}>Volver al laboratorio</Text>
        </Pressable>
      </Animated.View>
      <HiloRecogido alto={insets.top + 120} />
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  contenido: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  tipo: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.small, color: colors.accent },
  titulo: { fontFamily: fonts.title, fontSize: fontSizes.title, color: colors.text },
  texto: { fontFamily: fonts.body, fontSize: fontSizes.body, color: colors.textSecondary },
  boton: {
    marginTop: spacing.xl,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonTexto: { fontFamily: fonts.bodyBold, fontSize: fontSizes.body, color: colors.white },
});
