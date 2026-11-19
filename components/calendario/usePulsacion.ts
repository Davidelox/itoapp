import { type SharedValue, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

const MUELLE = { damping: 14, stiffness: 260 };

/** Ms que espera un `Pressable` antes de dar `onPressIn` (`unstable_pressDelay`): un scroll que empieza antes lo cancela. */
export const RETRASO_PULSACION = 80;

/**
 * Feedback de pulsación de una celda o una fila (docs/plan-calendario-v3.md §5), sin `setState` (todo en el hilo de UI):
 * un tinte que aparece con fundido y una escala que se hunde y rebota con un resorte al soltar.
 *
 * - `onPressIn` hace el fundido del tinte; `onPressOut` suelta con resorte. Los `Pressable` llevan
 *   `unstable_pressDelay={RETRASO_PULSACION}`: así `onPressIn` no llega si el dedo empieza un scroll vertical (se
 *   cancela antes) y no hay destello; y `Pressability` retrasa `onPressOut` hasta 130 ms, así que un toque rápido
 *   también deja ver el tinte.
 * - `arrastre` (1 mientras se desliza la rejilla para cambiar de periodo): el feedback desaparece al instante.
 * - `reducida` (movimiento reducido): solo el tinte, sin escala.
 */
export function usePulsacion({ arrastre, reducida, escala }: { arrastre: SharedValue<number>; reducida: boolean; escala: number }) {
  const p = useSharedValue(0);
  const handlers = {
    onPressIn: () => {
      p.set(withTiming(1, { duration: 90 }));
    },
    onPressOut: () => {
      p.set(withSpring(0, MUELLE));
    },
  };
  const estiloTinte = useAnimatedStyle(() => ({ opacity: arrastre.get() ? 0 : Math.max(0, Math.min(1, p.get())) }));
  const estiloEscala = useAnimatedStyle(() => ({
    transform: [{ scale: reducida || arrastre.get() ? 1 : 1 - (1 - escala) * p.get() }],
  }));
  return { handlers, estiloTinte, estiloEscala };
}
