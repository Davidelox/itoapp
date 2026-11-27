import { useEffect } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { puntosOndaCarga } from '@/components/hilo/ondaCarga';
import { trazoDePuntos } from '@/components/hilo/geometria';
import { crearEstilos, useColores } from '@/lib/tema';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Fase en la que se queda quieto con movimiento reducido (y con la que arranca): el hilo se ve ondulado. */
const FASE_QUIETA = Math.PI / 2;

/** Medidas del indicador: `small` 28 × 14, `large` 52 × 22; un número es el ancho (el alto, el 45 % de él). */
function medidas(size: 'small' | 'large' | number): { ancho: number; alto: number } {
  if (size === 'small') return { ancho: 28, alto: 14 };
  if (size === 'large') return { ancho: 52, alto: 22 };
  return { ancho: size, alto: Math.round(size * 0.45) };
}

/**
 * Indicador de carga con el hilo de ito (docs/plan-calendario-v3.md §6): un hilo horizontal por el que corre una onda
 * de izquierda a derecha, con los extremos quietos. Misma API que `ActivityIndicator` (`size`, `color`, `style`) para
 * poder sustituirlo sin tocar nada más. La animación va entera en el hilo de UI (un valor compartido que da vueltas
 * y un `d` animado), sin temporizadores de JS. Con movimiento reducido se queda quieto. `oculto`: para cuando ya hay
 * un texto o un botón que anuncia «cargando» y no debe leerse dos veces.
 */
export function CargandoHilo({
  size = 'small',
  color: colorProp,
  style,
  accessibilityLabel = 'Cargando',
  oculto = false,
}: {
  size?: 'small' | 'large' | number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  oculto?: boolean;
}) {
  const colors = useColores();
  const color = colorProp ?? colors.accent;
  const styles = useStyles();
  const { ancho, alto } = medidas(size);
  const grosor = Math.max(2, ancho / 18);
  const reducida = useReducedMotion();
  const fase = useSharedValue(FASE_QUIETA);

  // Solo escribe el valor compartido (no hay estado de React): una vuelta completa (2π) cada segundo, sin salto al repetir.
  useEffect(() => {
    if (reducida) {
      fase.set(FASE_QUIETA);
      return;
    }
    fase.set(withRepeat(withTiming(FASE_QUIETA + 2 * Math.PI, { duration: 1000, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(fase);
  }, [reducida, fase]);

  const animatedProps = useAnimatedProps(() => {
    const { xs, ys } = puntosOndaCarga(ancho, alto, grosor, fase.get());
    return { d: trazoDePuntos(xs, ys, xs.length) };
  });
  const inicial = puntosOndaCarga(ancho, alto, grosor, FASE_QUIETA);

  return (
    <View
      accessible={!oculto}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: true }}
      accessibilityElementsHidden={oculto}
      importantForAccessibility={oculto ? 'no-hide-descendants' : 'auto'}
      style={[styles.caja, { width: ancho, height: alto }, style]}
    >
      <Svg width={ancho} height={alto}>
        <AnimatedPath
          d={trazoDePuntos(inicial.xs, inicial.ys, inicial.xs.length)}
          fill="none"
          stroke={color}
          strokeWidth={grosor}
          strokeLinecap="round"
          strokeLinejoin="round"
          animatedProps={animatedProps}
        />
      </Svg>
    </View>
  );
}

const useStyles = crearEstilos((colors) => ({
  // `alignSelf: 'center'`: en un padre con `alignItems: 'stretch'` (el de por defecto) el indicador, de ancho fijo, quedaría
  // pegado a la izquierda; así se centra como se centraba `ActivityIndicator`. En una fila solo centra en vertical.
  caja: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
}));
