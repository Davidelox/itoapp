import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TarjetaConectada } from '@/components/hilo/TarjetaConectada';
import { TarjetaColgada, rectDeDetalle } from '@/components/hilo/TirarDelHilo';
import { colors, fonts, fontSizes, radius, spacing } from '@/constants/theme';

export default function Detalle() {
  const { titulo, tipo, detalle } = useLocalSearchParams<{ titulo?: string; tipo?: string; detalle?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reducida = useReducedMotion();
  // La tarjeta ya está en pantalla (la ha traído el hilo); el resto del detalle se arma a su alrededor.
  const rect = rectDeDetalle(width, insets.top);
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withTiming(1, { duration: reducida ? 200 : 520, easing: Easing.out(Easing.cubic) });
  }, [p, reducida]);

  const volver = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={styles.pantalla}>
      <Bloque progreso={p} orden={0} reducida={reducida} style={[styles.cabecera, { top: insets.top + spacing.xl }]}>
        <Pressable accessibilityRole="button" onPress={volver} hitSlop={12}>
          <Text style={styles.volver}>‹ Volver</Text>
        </Pressable>
      </Bloque>
      <TarjetaColgada rect={rect}>
        <TarjetaConectada
          tipo={tipo ?? 'Detalle'}
          titulo={titulo ?? 'Detalle de ejemplo'}
          detalle={detalle ?? 'Esta pantalla aparece al tirar del hilo de una tarjeta.'}
          style={styles.flex}
        />
      </TarjetaColgada>
      <View style={[styles.contenido, { paddingTop: rect.y + rect.height + spacing.xl }]}>
        <Bloque progreso={p} orden={1} reducida={reducida}>
          <Text style={styles.subtitulo}>Tirar del hilo</Text>
          <Text style={styles.texto}>
            Esta pantalla se arma alrededor de la tarjeta que ha traído el hilo. Al volver, el hilo la devuelve a su
            sitio.
          </Text>
        </Bloque>
        <Bloque progreso={p} orden={2} reducida={reducida}>
          <Pressable
            accessibilityRole="button"
            onPress={volver}
            style={({ pressed }) => [styles.boton, pressed && { backgroundColor: colors.accentDark }]}
          >
            <Text style={styles.botonTexto}>Volver al laboratorio</Text>
          </Pressable>
        </Bloque>
      </View>
    </View>
  );
}

/** Parte del detalle que aparece escalonada: sube unos píxeles y se funde (con movimiento reducido, solo se funde). */
function Bloque({
  progreso,
  orden,
  reducida,
  style,
  children,
}: {
  progreso: SharedValue<number>;
  orden: number;
  reducida: boolean;
  style?: ComponentProps<typeof Animated.View>['style'];
  children: ReactNode;
}) {
  const estilo = useAnimatedStyle(() => {
    const inicio = orden * 0.2;
    const t = Math.min(1, Math.max(0, (progreso.value - inicio) / (1 - inicio)));
    return { opacity: t, transform: reducida ? [] : [{ translateY: (1 - t) * 14 }] };
  });
  return <Animated.View style={[style, estilo]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  cabecera: { position: 'absolute', left: spacing.xl, zIndex: 2 },
  volver: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.body, color: colors.accent },
  contenido: { paddingHorizontal: spacing.xl, gap: spacing.xl },
  subtitulo: { fontFamily: fonts.title, fontSize: 22, color: colors.text, marginBottom: spacing.sm },
  texto: { fontFamily: fonts.body, fontSize: fontSizes.body, color: colors.textSecondary },
  boton: {
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonTexto: { fontFamily: fonts.bodyBold, fontSize: fontSizes.body, color: colors.white },
});
