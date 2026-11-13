import { Children, Fragment, useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg from 'react-native-svg';

import { HiloTrazo } from './trazo';

const HUECO = 40;
const ANCHO = 60;
// Hilo vertical con un rizo pequeño a media altura.
const SEGMENTO = 'M 30 0 L 30 9 C 30 14, 38 14, 38 20 C 38 27, 24 26, 25 20 C 26 14, 30 16, 30 22 L 30 40';

/** Une una lista de tarjetas con un hilo que se dibuja al aparecer. */
export function HiloConector({ children }: { children: ReactNode }) {
  const items = Children.toArray(children);
  return (
    <View>
      {items.map((item, i) => (
        <Fragment key={i}>
          {item}
          {i < items.length - 1 && <Segmento indice={i} />}
        </Fragment>
      ))}
    </View>
  );
}

function Segmento({ indice }: { indice: number }) {
  const reducida = useReducedMotion();
  const progreso = useSharedValue(0);
  const fundido = useSharedValue(0);

  useEffect(() => {
    const retraso = indice * 250;
    if (reducida) {
      progreso.value = 1;
      fundido.value = withDelay(retraso, withTiming(1, { duration: 200 }));
      return;
    }
    fundido.value = 1;
    progreso.value = withDelay(retraso, withTiming(1, { duration: 450, easing: Easing.inOut(Easing.cubic) }));
  }, [indice, reducida, progreso, fundido]);

  const estilo = useAnimatedStyle(() => ({ opacity: fundido.value }));

  return (
    <Animated.View style={[styles.hueco, estilo]} importantForAccessibility="no-hide-descendants">
      <Svg width={ANCHO} height={HUECO} viewBox={`0 0 ${ANCHO} ${HUECO}`}>
        <HiloTrazo d={SEGMENTO} progress={progreso} strokeWidth={2} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hueco: { height: HUECO, alignItems: 'center' },
});
