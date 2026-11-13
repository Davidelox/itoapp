import { useMemo } from 'react';
import Animated, { type SharedValue, useAnimatedProps } from 'react-native-reanimated';
import { Path } from 'react-native-svg';

import { colors } from '@/constants/theme';

/** Recorrido del hilo del icono de ito (viewBox 100x100). Entra por la izquierda, un tirabuzón, sale por la derecha. */
export const HILO_ICONO =
  'M -2 22 C 20 22, 40 12, 56 20 C 70 27, 66 42, 58 36 C 50 30, 66 18, 86 22 C 98 24, 108 36, 114 56';

/** Longitud aproximada de un trazado con comandos absolutos M, L y C. */
export function medirTrazo(d: string): number {
  const tokens = d.match(/[MLC]|-?\d*\.?\d+/g) ?? [];
  let i = 0;
  let cmd = 'M';
  let cx = 0;
  let cy = 0;
  let total = 0;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    if (/[MLC]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === 'M' || cmd === 'L') {
      const x = num();
      const y = num();
      if (cmd === 'L') total += Math.hypot(x - cx, y - cy);
      cx = x;
      cy = y;
      if (cmd === 'M') cmd = 'L';
    } else {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
      let px = cx;
      let py = cy;
      for (let s = 1; s <= 24; s++) {
        const t = s / 24;
        const u = 1 - t;
        const bx = u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x;
        const by = u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y;
        total += Math.hypot(bx - px, by - py);
        px = bx;
        py = by;
      }
      cx = x;
      cy = y;
    }
  }
  return total;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

type Props = {
  d: string;
  /** 0 = nada dibujado, 1 = trazo completo. */
  progress: SharedValue<number>;
  stroke?: string;
  strokeWidth?: number;
  opacity?: SharedValue<number>;
};

/** Trazo que se dibuja con strokeDasharray/strokeDashoffset animados. Debe ir dentro de un <Svg>. */
export function HiloTrazo({ d, progress, stroke = colors.accent, strokeWidth = 2, opacity }: Props) {
  const len = useMemo(() => medirTrazo(d) + 2, [d]);
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: len * (1 - progress.value),
    // Evita el punto que dejan los extremos redondeados con el trazo a 0.
    opacity: (progress.value <= 0.001 ? 0 : 1) * (opacity ? opacity.value : 1),
  }));
  return (
    <AnimatedPath
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={[len, len]}
      animatedProps={animatedProps}
    />
  );
}
