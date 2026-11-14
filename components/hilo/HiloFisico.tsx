import Animated, { type SharedValue, useAnimatedProps } from 'react-native-reanimated';
import { G, Path } from 'react-native-svg';

import { colors } from '@/constants/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Tonos del hilo. El granate es el de siempre, sobre fondos claros; el crema es el mismo hilo
 * visto sobre el granate (botones), donde la sombra necesita más fuerza para notarse.
 */
const TONOS = {
  granate: { cuerpo: colors.accent, sombra: colors.accentDark, fuerzaSombra: 1 },
  crema: { cuerpo: colors.background, sombra: '#2B080E', fuerzaSombra: 2.2 },
} as const;

export type TonoHilo = keyof typeof TONOS;

type Props = {
  /** Atributo `d` del hilo visible; se calcula en el hilo de UI (trazoEntre, trazoDePuntos…). */
  d: SharedValue<string>;
  /** Grosor actual del hilo, en píxeles. */
  grosor: SharedValue<number>;
  /** Grosor de referencia: fija el desplazamiento de la sombra. */
  grosorBase: number;
  /** Cuánto se separa el hilo de la superficie (0 = apoyado, 1 = en el aire): abre la sombra. */
  sombra?: SharedValue<number>;
  /** Color del hilo: granate (por defecto) o crema, para fondos granates. */
  tono?: TonoHilo;
};

/**
 * El hilo de ito: un trazo liso, de extremos y uniones redondeados, con una sombra blanda que lo
 * separa del fondo. Sin texturas: lo que lo hace parecer un hilo es cómo se mueve y cómo cae.
 * Debe ir dentro de un <Svg>. Las tres capas comparten el mismo trazado, así que en cada fotograma
 * solo se calcula una cadena `d`.
 */
export function HiloFisico({ d, grosor, grosorBase, sombra, tono = 'granate' }: Props) {
  const g = grosorBase;
  const t = TONOS[tono];
  const fuerza = t.fuerzaSombra;

  const sombraAncha = useAnimatedProps(() => ({
    d: d.value,
    strokeWidth: grosor.value + 3,
    opacity: (0.07 + 0.03 * (sombra ? sombra.value : 0)) * fuerza,
  }));
  const sombraCercana = useAnimatedProps(() => ({ d: d.value, strokeWidth: grosor.value + 0.6 }));
  const cuerpo = useAnimatedProps(() => ({ d: d.value, strokeWidth: grosor.value }));

  return (
    <>
      <G transform={`translate(${g * 0.45} ${g * 1.15})`}>
        <AnimatedPath
          animatedProps={sombraAncha}
          fill="none"
          stroke={t.sombra}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
      <G transform={`translate(${g * 0.2} ${g * 0.55})`}>
        <AnimatedPath
          animatedProps={sombraCercana}
          fill="none"
          stroke={t.sombra}
          strokeOpacity={0.13 * fuerza}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
      <AnimatedPath
        animatedProps={cuerpo}
        fill="none"
        stroke={t.cuerpo}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}
