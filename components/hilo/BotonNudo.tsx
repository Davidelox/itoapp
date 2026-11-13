import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg from 'react-native-svg';

import { colors, fonts, radius } from '@/constants/theme';
import { hapticaExito } from './haptics';
import { HiloTrazo } from './trazo';

// Hilo que entra por la izquierda, hace un lazo en el centro y sale por la derecha (viewBox 100x30).
const NUDO = 'M 18 17 C 32 17, 40 17, 44 15 C 52 11, 56 3, 50 3 C 43 3, 44 21, 55 20 C 62 19, 64 15, 82 14';

type Props = {
  label: string;
  labelHecho?: string;
  onPress?: () => void;
};

export function BotonNudo({ label, labelHecho = 'Guardado', onPress }: Props) {
  const reducida = useReducedMotion();
  const [hecho, setHecho] = useState(false);
  const ocupado = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const texto = useSharedValue(1);
  const hilo = useSharedValue(0);
  const hiloOp = useSharedValue(1);

  useEffect(() => {
    const ts = timers;
    return () => ts.current.forEach(clearTimeout);
  }, []);

  const pulsar = () => {
    if (ocupado.current) return;
    ocupado.current = true;
    onPress?.();
    hapticaExito();
    const luego = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

    if (reducida) {
      // Sin hilo ni escala: fundido corto entre etiquetas.
      texto.value = withSequence(withTiming(0, { duration: 100 }), withTiming(1, { duration: 100 }));
      luego(100, () => setHecho(true));
      luego(1000, () => {
        texto.value = withSequence(withTiming(0, { duration: 100 }), withTiming(1, { duration: 100 }));
      });
      luego(1100, () => setHecho(false));
      luego(1200, () => {
        ocupado.current = false;
      });
      return;
    }

    hilo.value = 0;
    hiloOp.value = 1;
    // Texto: encoge y se oculta; reaparece con la etiqueta de éxito.
    texto.value = withSequence(withTiming(0, { duration: 200 }), withDelay(250, withTiming(1, { duration: 200 })));
    // Hilo: se dibuja haciendo el lazo y se desvanece.
    hilo.value = withTiming(1, { duration: 380, easing: Easing.inOut(Easing.cubic) });
    hiloOp.value = withDelay(380, withTiming(0, { duration: 250 }));
    luego(220, () => setHecho(true));
    luego(900, () => {
      texto.value = withTiming(0, { duration: 150 });
    });
    luego(1050, () => {
      setHecho(false);
      texto.value = withTiming(1, { duration: 150 });
    });
    luego(1200, () => {
      ocupado.current = false;
    });
  };

  const textoStyle = useAnimatedStyle(() => ({
    opacity: texto.value,
    transform: [{ scale: reducida ? 1 : 0.6 + 0.4 * texto.value }],
  }));

  return (
    <Pressable
      onPress={pulsar}
      accessibilityRole="button"
      accessibilityLabel={hecho ? labelHecho : label}
      style={({ pressed }) => [styles.boton, pressed && styles.pulsado]}
    >
      <Animated.Text style={[styles.texto, textoStyle]}>{hecho ? labelHecho : label}</Animated.Text>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 30" preserveAspectRatio="xMidYMid meet" pointerEvents="none">
        <HiloTrazo d={NUDO} progress={hilo} opacity={hiloOp} stroke={colors.background} strokeWidth={1.8} />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  boton: {
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  pulsado: { backgroundColor: colors.accentDark },
  texto: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.white },
});
