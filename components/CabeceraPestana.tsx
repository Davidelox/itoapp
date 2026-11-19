import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '@/constants/theme';

/** Scroll (px) a partir del cual la separación de la cabecera se ve entera. */
const SCROLL_SEPARACION = 12;

/**
 * Para la cabecera fija: devuelve el `onScroll` del `Animated.ScrollView` de la pestaña y un valor de 0 (arriba del
 * todo) a 1 (con 12 px o más de scroll) que anima la separación de la cabecera. Es un `SharedValue`: no re-renderiza
 * la pantalla al desplazarse.
 */
export function useScrollCabecera() {
  const sombra = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      // El rebote de iOS (offset negativo) da 0.
      sombra.set(Math.min(1, Math.max(0, e.contentOffset.y / SCROLL_SEPARACION)));
    },
  });
  return { onScroll, sombra };
}

/**
 * Cabecera fija de una pestaña (docs/plan-cabeceras-calendario.md §2): título a la izquierda, `accion` a la
 * derecha (avatares, «Hoy»…). Va fuera del scroll, con fondo opaco; al desplazarse la pantalla aparece una línea y
 * una sombra suave debajo (`sombra`, de `useScrollCabecera`; sin ella no se ve separación).
 */
export function CabeceraPestana({ titulo, accion, sombra }: { titulo: string; accion?: ReactNode; sombra?: SharedValue<number> }) {
  const insets = useSafeAreaInsets();
  const contenedor = useAnimatedStyle(() => {
    const s = sombra ? sombra.get() : 0;
    if (Platform.OS === 'ios') return { shadowOpacity: 0.07 * s };
    if (Platform.OS === 'android') return { elevation: 2 * s };
    return {};
  });
  const linea = useAnimatedStyle(() => ({ opacity: sombra ? sombra.get() : 0 }));
  return (
    <Animated.View style={[styles.contenedor, { paddingTop: insets.top }, contenedor]}>
      <View style={styles.fila}>
        <Text accessibilityRole="header" style={styles.titulo} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {titulo}
        </Text>
        {accion ? <View style={styles.accion}>{accion}</View> : null}
      </View>
      <Animated.View pointerEvents="none" style={[styles.linea, linea]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    backgroundColor: colors.background,
    zIndex: 1,
    shadowColor: '#7A3419',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    shadowOpacity: 0,
  },
  fila: {
    minHeight: 56,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titulo: { flexShrink: 1, fontFamily: fonts.title, fontSize: 28, lineHeight: 34, letterSpacing: -0.3, color: colors.text },
  accion: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linea: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: colors.border },
});
