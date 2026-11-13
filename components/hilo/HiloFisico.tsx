import Animated, { type SharedValue, useAnimatedProps } from 'react-native-reanimated';
import { G, Path } from 'react-native-svg';

import { colors } from '@/constants/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Tonos del hilo. El granate es el de siempre, sobre fondos claros; el crema es el mismo hilo
 * visto sobre el granate (botones). Luz y destello son tintes derivados del color del cuerpo.
 */
const TONOS = {
  granate: {
    cuerpo: colors.accent,
    torsion: colors.accentDark,
    opacidadTorsion: 0.5,
    luz: '#B9566A',
    opacidadLuz: 0.6,
    destello: '#F0C3CB',
    sombra: colors.accentDark,
    opacidadSombra: 1,
  },
  crema: {
    cuerpo: colors.background,
    torsion: '#C9BB98',
    opacidadTorsion: 0.6,
    luz: colors.white,
    opacidadLuz: 0.85,
    destello: colors.white,
    sombra: '#2B080E',
    opacidadSombra: 2.4,
  },
} as const;

export type TonoHilo = keyof typeof TONOS;

type Props = {
  /** Atributo `d` del hilo visible; se calcula en el hilo de UI con `trazoEntre`. */
  d: SharedValue<string>;
  /** Tramo corto junto a la punta que lleva el destello. Opcional. */
  dPunta?: SharedValue<string>;
  /** Grosor actual del hilo, en píxeles. */
  grosor: SharedValue<number>;
  /** Grosor de referencia: fija la torsión y el desplazamiento de luz y sombra. */
  grosorBase: number;
  /** Opacidad del destello de la punta (0-1). */
  destello?: SharedValue<number>;
  /** Cuánto se separa el hilo de la superficie (0 = apoyado, 1 = en el aire): abre la sombra. */
  sombra?: SharedValue<number>;
  /** Color del hilo: granate (por defecto) o crema, para fondos granates. */
  tono?: TonoHilo;
};

/**
 * Hilo con volumen: sombra blanda sobre el fondo, cuerpo granate, torsión de los cabos,
 * una línea de luz en la cara superior y un destello que acompaña a la punta.
 * Debe ir dentro de un <Svg>. Todas las capas comparten el mismo trazado, así que en cada
 * fotograma solo se calcula una cadena `d`.
 */
export function HiloFisico({ d, dPunta, grosor, grosorBase, destello, sombra, tono = 'granate' }: Props) {
  const g = grosorBase;
  const t = TONOS[tono];
  const fuerzaSombra = t.opacidadSombra;

  const sombraAncha = useAnimatedProps(() => ({
    d: d.value,
    strokeWidth: grosor.value + 3,
    opacity: (0.07 + 0.03 * (sombra ? sombra.value : 0)) * fuerzaSombra,
  }));
  const sombraCercana = useAnimatedProps(() => ({ d: d.value, strokeWidth: grosor.value + 0.6 }));
  const cuerpo = useAnimatedProps(() => ({ d: d.value, strokeWidth: grosor.value }));
  const torsion = useAnimatedProps(() => ({ d: d.value, strokeWidth: grosor.value }));
  const luz = useAnimatedProps(() => ({ d: d.value, strokeWidth: grosor.value * 0.26 }));
  const punta = useAnimatedProps(() => ({
    d: dPunta ? dPunta.value : d.value,
    strokeWidth: grosor.value * 0.34,
    opacity: dPunta && destello ? destello.value : 0,
  }));

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
          strokeOpacity={0.13 * fuerzaSombra}
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
      {/* Torsión: vetas oscuras a intervalos cortos, como los cabos retorcidos de un hilo. */}
      <AnimatedPath
        animatedProps={torsion}
        fill="none"
        stroke={t.torsion}
        strokeOpacity={t.opacidadTorsion}
        strokeLinecap="butt"
        strokeLinejoin="round"
        strokeDasharray={[g * 0.42, g * 0.78]}
      />
      {/* Luz: una fibra clara, desplazada hacia arriba a la izquierda y entrecortada de forma irregular. */}
      <G transform={`translate(${-g * 0.17} ${-g * 0.2})`}>
        <AnimatedPath
          animatedProps={luz}
          fill="none"
          stroke={t.luz}
          strokeOpacity={t.opacidadLuz}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={[g * 7, g * 1.1, g * 3.4, g * 1.6, g * 5.2, g * 0.9]}
        />
        {dPunta ? (
          <AnimatedPath
            animatedProps={punta}
            fill="none"
            stroke={t.destello}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </G>
    </>
  );
}
