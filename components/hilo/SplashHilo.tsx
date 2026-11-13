import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg from 'react-native-svg';

import { colors, fonts } from '@/constants/theme';
import { HILO_ICONO, HiloTrazo } from './trazo';

const TOTAL_MS = 1550;
const f = (ms: number) => ms / TOTAL_MS; // fracción del tiempo total

/**
 * Capa a pantalla completa: el hilo se dibuja (0-850 ms), aparece "ito" (700-1100 ms)
 * y todo se desvanece (1250-1550 ms). Tocar para saltar.
 */
export function SplashHilo({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const reducida = useReducedMotion();
  const master = useSharedValue(0);
  const saltado = useSharedValue(1);
  const fundidoReducido = useSharedValue(0);
  const terminado = useRef(false);

  const terminar = useCallback(() => {
    if (terminado.current) return;
    terminado.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    if (reducida) {
      // Movimiento reducido: solo un fundido con el estado final (hilo + "ito").
      fundidoReducido.value = withSequence(
        withTiming(1, { duration: 200 }),
        withDelay(600, withTiming(0, { duration: 200 }, (fin) => fin && runOnJS(terminar)())),
      );
      return;
    }
    master.value = withTiming(1, { duration: TOTAL_MS, easing: Easing.linear }, (fin) => {
      if (fin) runOnJS(terminar)();
    });
  }, [reducida, master, fundidoReducido, terminar]);

  const saltar = () => {
    cancelAnimation(master);
    cancelAnimation(fundidoReducido);
    saltado.value = withTiming(0, { duration: 150 }, () => runOnJS(terminar)());
  };

  const progresoHilo = useDerivedValue(() => {
    if (reducida) return 1;
    const p = interpolate(master.value, [0, f(850)], [0, 1], 'clamp');
    return Easing.inOut(Easing.cubic)(p);
  });

  const capaStyle = useAnimatedStyle(() => ({
    opacity: saltado.value * (reducida ? 1 : interpolate(master.value, [f(1250), 1], [1, 0], 'clamp')),
  }));
  const contenidoStyle = useAnimatedStyle(() => ({ opacity: reducida ? fundidoReducido.value : 1 }));
  const textoStyle = useAnimatedStyle(() => {
    const p = reducida ? 1 : interpolate(master.value, [f(700), f(1100)], [0, 1], 'clamp');
    return { opacity: p, transform: [{ translateY: (1 - p) * 8 }] };
  });

  return (
    <Animated.View style={[styles.capa, capaStyle]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={saltar}
        accessibilityRole="button"
        accessibilityLabel="Saltar animación de inicio"
      >
        <Animated.View style={[styles.centro, contenidoStyle]}>
          <Svg width={width} height={width * 0.6} viewBox="0 0 100 60">
            <HiloTrazo d={HILO_ICONO} progress={progresoHilo} strokeWidth={0.9} />
          </Svg>
          <Animated.Text style={[styles.logo, textoStyle]}>ito</Animated.Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  capa: { ...StyleSheet.absoluteFill, backgroundColor: colors.background, zIndex: 1000 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { fontFamily: fonts.brand, fontSize: 84, color: colors.accent, marginTop: -8 },
});
