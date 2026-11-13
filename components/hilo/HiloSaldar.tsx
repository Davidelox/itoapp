import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { colors, fonts, personColors } from '@/constants/theme';
import { hapticaExito } from './haptics';
import { HiloTrazo } from './trazo';

const ANCHO = 280;
const ALTO = 130;
// Cabos y nudo central (el hilo une el borde de cada avatar).
const CABO_IZQ = 'M 64 52 C 90 74, 112 72, 130 54';
const NUDO = 'M 130 54 C 134 44, 148 40, 150 48 C 152 57, 134 60, 134 50 C 134 44, 146 42, 150 54';
const CABO_DER = 'M 150 54 C 168 72, 190 74, 216 52';
const PIVOTE_IZQ = { x: 64, y: 52 };
const PIVOTE_DER = { x: 216, y: 52 };

export type HiloSaldarHandle = { desatar: () => void; reiniciar: () => void };

type Props = {
  /** Si se pasa, controla el estado; si no, se controla con el handle (desatar/reiniciar). */
  saldado?: boolean;
  ref?: Ref<HiloSaldarHandle>;
};

export function HiloSaldar({ saldado, ref }: Props) {
  const reducida = useReducedMotion();
  const [interno, setInterno] = useState(false);
  const activo = saldado ?? interno;
  const primera = useRef(true);

  useImperativeHandle(ref, () => ({
    desatar: () => setInterno(true),
    reiniciar: () => setInterno(false),
  }));

  const u = useSharedValue(0); // 0 = anudado, 1 = desatado
  const mensaje = useSharedValue(0);

  useEffect(() => {
    const omitirHaptica = primera.current;
    primera.current = false;
    if (activo && !omitirHaptica) hapticaExito();
    if (reducida) {
      u.value = activo ? 1 : 0;
      mensaje.value = withTiming(activo ? 1 : 0, { duration: 200 });
      return;
    }
    u.value = withTiming(activo ? 1 : 0, { duration: activo ? 1100 : 400, easing: Easing.inOut(Easing.cubic) });
    mensaje.value = activo ? withDelay(800, withTiming(1, { duration: 300 })) : withTiming(0, { duration: 200 });
  }, [activo, reducida, u, mensaje]);

  // El nudo se deshace en el primer tercio.
  const nudoProgreso = useDerivedValue(() => 1 - interpolate(u.value, [0, 0.35], [0, 1], 'clamp'));

  const cabo = (pivote: { x: number; y: number }, signo: 1 | -1) => ({
    transform: [
      { translateX: pivote.x - ANCHO / 2 },
      { translateY: pivote.y - ALTO / 2 },
      { rotate: `${signo * interpolate(u.value, [0.25, 1], [0, 78], 'clamp')}deg` },
      { translateX: -(pivote.x - ANCHO / 2) },
      { translateY: -(pivote.y - ALTO / 2) },
    ],
  });
  const izqStyle = useAnimatedStyle(() => cabo(PIVOTE_IZQ, 1));
  const derStyle = useAnimatedStyle(() => cabo(PIVOTE_DER, -1));
  const mensajeStyle = useAnimatedStyle(() => ({
    opacity: mensaje.value,
    transform: [{ translateY: (1 - mensaje.value) * 6 }],
  }));

  return (
    <View style={styles.contenedor} accessible accessibilityLabel={activo ? 'Cuentas a cero' : 'Cuentas pendientes de saldar'}>
      <View style={styles.escena}>
        <Animated.View style={[StyleSheet.absoluteFill, izqStyle]} pointerEvents="none">
          <Svg width={ANCHO} height={ALTO}>
            <Path d={CABO_IZQ} stroke={colors.accent} strokeWidth={2.4} strokeLinecap="round" fill="none" />
          </Svg>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, derStyle]} pointerEvents="none">
          <Svg width={ANCHO} height={ALTO}>
            <Path d={CABO_DER} stroke={colors.accent} strokeWidth={2.4} strokeLinecap="round" fill="none" />
          </Svg>
        </Animated.View>
        <Svg width={ANCHO} height={ALTO} style={StyleSheet.absoluteFill}>
          <HiloTrazo d={NUDO} progress={nudoProgreso} strokeWidth={2.4} />
        </Svg>
        <Avatar letra="D" left={8} paleta={personColors.mint} />
        <Avatar letra="M" left={ANCHO - 8 - 56} paleta={personColors.lavender} />
      </View>
      <Animated.Text style={[styles.mensaje, mensajeStyle]}>¡Cuentas a cero!</Animated.Text>
    </View>
  );
}

function Avatar({ letra, left, paleta }: { letra: string; left: number; paleta: { bg: string; ink: string } }) {
  return (
    <View style={[styles.avatar, { left, backgroundColor: paleta.bg }]}>
      <Text style={[styles.letra, { color: paleta.ink }]}>{letra}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { alignItems: 'center' },
  escena: { width: ANCHO, height: ALTO },
  avatar: {
    position: 'absolute',
    top: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letra: { fontFamily: fonts.titleBold, fontSize: 24 },
  mensaje: { fontFamily: fonts.title, fontSize: 22, color: colors.accent, marginTop: 4, minHeight: 30 },
});
