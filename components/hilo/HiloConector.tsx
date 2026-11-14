import { Children, Fragment, useEffect, useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '@/constants/theme';
import { type Cubica, muestrearRecorrido, trazoEntre } from './geometria';
import { HiloFisico } from './HiloFisico';

/** Separación entre tarjetas y cuánto se mete el lienzo del hilo dentro de cada una (para los ojales). */
const HUECO = 40;
const SOLAPE = 10;
const ANCHO = 96;
const ALTO = HUECO + 2 * SOLAPE;
const GROSOR = 2.3;
/** Holgura con la que descansa el hilo entre dos tarjetas (0 = tirante, 1 = recién soltado). */
const HOLGURA_REPOSO = 0.4;

/** Hilo de un ojal al siguiente: tirante (una S suave) y con holgura (cuelga y se abre hacia los lados). */
function recorridoEntreTarjetas(lado: 1 | -1) {
  const a: [number, number] = [ANCHO / 2 - 9 * lado, SOLAPE - 5];
  const b: [number, number] = [ANCHO / 2 + 9 * lado, SOLAPE + HUECO + 5];
  const tenso: Cubica = [a, [a[0], a[1] + 15], [b[0], b[1] - 15], b];
  const flojo: Cubica = [a, [a[0] - 22 * lado, a[1] + 30], [b[0] + 22 * lado, b[1] - 30], b];
  return { a, b, recorrido: muestrearRecorrido([tenso], [flojo], 2) };
}

type Props = {
  children: ReactNode;
  /** Desplazamiento del scroll que contiene las tarjetas: el hilo se mece un poco al moverlo. Opcional. */
  desplazamiento?: SharedValue<number>;
};

/**
 * Cose una lista de tarjetas relacionadas: entre cada dos, un hilo sale por un ojal del borde de
 * una y entra por otro de la siguiente, colgando con algo de holgura. Los tramos se dibujan
 * escalonados al aparecer y se asientan con un muelle.
 */
export function HiloConector({ children, desplazamiento }: Props) {
  const items = Children.toArray(children);
  return (
    <View>
      {items.map((item, i) => (
        <Fragment key={i}>
          {item}
          {i < items.length - 1 && <Segmento indice={i} desplazamiento={desplazamiento} />}
        </Fragment>
      ))}
    </View>
  );
}

function Segmento({ indice, desplazamiento }: { indice: number; desplazamiento?: SharedValue<number> }) {
  const reducida = useReducedMotion();
  const lado = indice % 2 === 0 ? 1 : -1;
  const { a, b, recorrido } = useMemo(() => recorridoEntreTarjetas(lado), [lado]);
  const ultimo = recorrido.tx.length - 1;

  const dibujo = useSharedValue(reducida ? 1 : 0);
  const holgura = useSharedValue(reducida ? HOLGURA_REPOSO : 1);
  /** Vaivén añadido por el scroll; vuelve a cero con un muelle. */
  const meneo = useSharedValue(0);
  const fundido = useSharedValue(0);
  const grosor = useSharedValue(GROSOR);

  useEffect(() => {
    const retraso = 150 + indice * 220;
    if (reducida) {
      fundido.value = withDelay(retraso, withTiming(1, { duration: 200 }));
      return;
    }
    // Los ojales aparecen, el hilo pasa de uno a otro y se asienta.
    fundido.value = withDelay(retraso, withTiming(1, { duration: 160 }));
    dibujo.value = withDelay(retraso + 80, withTiming(1, { duration: 380, easing: Easing.bezier(0.3, 0.1, 0.25, 1) }));
    holgura.value = withDelay(retraso + 400, withSpring(HOLGURA_REPOSO, { stiffness: 190, damping: 11, mass: 1 }));
  }, [indice, reducida, dibujo, holgura, fundido]);

  // Al desplazar la lista, el hilo se queda un poco atrás y luego se recoloca.
  useAnimatedReaction(
    () => (desplazamiento ? desplazamiento.value : 0),
    (actual, anterior) => {
      if (reducida || anterior === null || actual === anterior) return;
      const empuje = Math.max(-0.5, Math.min(0.5, (actual - anterior) * 0.03));
      meneo.value = withSequence(
        withTiming(empuje, { duration: 60 }),
        withSpring(0, { stiffness: 150, damping: 9, mass: 1 }),
      );
    },
  );

  const d = useDerivedValue(() =>
    trazoEntre(recorrido, holgura.value + meneo.value, 0, dibujo.value * ultimo),
  );
  const elevacion = useDerivedValue(() => Math.min(Math.max(holgura.value, 0), 1));
  const estilo = useAnimatedStyle(() => ({ opacity: fundido.value }));

  return (
    <View style={styles.hueco} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.lienzo, estilo]}>
        <Svg width={ANCHO} height={ALTO}>
          <Ojal x={a[0]} y={a[1]} />
          <Ojal x={b[0]} y={b[1]} />
          <HiloFisico d={d} grosor={grosor} grosorBase={GROSOR} sombra={elevacion} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Ojal por el que el hilo atraviesa el borde de la tarjeta: un aro con el hueco en sombra. */
function Ojal({ x, y }: { x: number; y: number }) {
  return (
    <>
      <Circle cx={x} cy={y} r={4.4} fill={colors.segmented} stroke={colors.inputBorder} strokeWidth={1.2} />
      <Circle cx={x} cy={y + 0.6} r={2} fill={colors.inputBorder} />
    </>
  );
}

const styles = StyleSheet.create({
  // Por encima de las tarjetas vecinas, para que los ojales se vean sobre su borde.
  hueco: { height: HUECO, alignItems: 'center', zIndex: 1 },
  lienzo: { position: 'absolute', top: -SOLAPE, width: ANCHO, height: ALTO },
});
