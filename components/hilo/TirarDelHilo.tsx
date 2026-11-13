import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import {
  Easing,
  runOnJS,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg from 'react-native-svg';

import { hapticaLigera } from './haptics';
import { HiloTrazo } from './trazo';

/** Hilo vertical con un rizo; va de (cx, desde) hacia (cx, hasta). */
function trazoVertical(cx: number, desde: number, hasta: number) {
  const dir = hasta < desde ? -1 : 1;
  const m = (desde + hasta) / 2;
  const y = (d: number) => m + dir * d;
  return (
    `M ${cx} ${desde} L ${cx} ${y(-22)} ` +
    `C ${cx} ${y(-14)}, ${cx + 8} ${y(-14)}, ${cx + 8} ${y(-8)} ` +
    `C ${cx + 8} ${y(-1)}, ${cx - 6} ${y(-2)}, ${cx - 5} ${y(-8)} ` +
    `C ${cx - 4} ${y(-14)}, ${cx} ${y(-10)}, ${cx} ${y(0)} L ${cx} ${hasta}`
  );
}

/**
 * Al tocar una tarjeta, un hilo sale de ella hacia arriba y después se navega.
 * `overlay` hay que renderizarlo una vez, como hijo de la pantalla (a pantalla completa).
 */
export function useTirarDelHilo() {
  const { width } = useWindowDimensions();
  const reducida = useReducedMotion();
  const progreso = useSharedValue(0);
  const [desdeY, setDesdeY] = useState<number | null>(null);

  const tirar = useCallback(
    (yTarjeta: number, ir: () => void) => {
      if (reducida) {
        ir();
        return;
      }
      hapticaLigera();
      setDesdeY(Math.max(yTarjeta, 80));
      progreso.set(0);
      progreso.set(withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }, (fin) => {
        if (fin) runOnJS(ir)();
      }));
    },
    [reducida, progreso],
  );

  /** Vuelve a dejar el hilo recogido (al volver a la pantalla). */
  const reiniciar = useCallback(() => {
    progreso.set(0);
    setDesdeY(null);
  }, [progreso]);

  const overlay: ReactElement | null =
    desdeY === null ? null : (
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <HiloTrazo d={trazoVertical(width / 2, desdeY, 0)} progress={progreso} strokeWidth={2.4} />
      </Svg>
    );

  return { tirar, overlay, reiniciar };
}

/** En la pantalla de detalle: el hilo que venía de arriba se recoge hacia el borde superior. */
export function HiloRecogido({ alto = 160 }: { alto?: number }) {
  const { width } = useWindowDimensions();
  const reducida = useReducedMotion();
  const progreso = useSharedValue(reducida ? 0 : 1);
  const [visible, setVisible] = useState(!reducida);

  useEffect(() => {
    if (reducida) return;
    progreso.value = withDelay(
      60,
      withTiming(0, { duration: 380, easing: Easing.inOut(Easing.cubic) }, (fin) => {
        if (fin) runOnJS(setVisible)(false);
      }),
    );
  }, [reducida, progreso]);

  if (!visible) return null;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <HiloTrazo d={trazoVertical(width / 2, 0, alto)} progress={progreso} strokeWidth={2.4} />
    </Svg>
  );
}
