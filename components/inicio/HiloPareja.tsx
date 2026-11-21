import { useIsFocused, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedProps, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { trazoDePuntos } from '@/components/hilo/geometria';
import { puntosOndaCarga } from '@/components/hilo/ondaCarga';
import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { colors, fonts } from '@/constants/theme';
import { paletaDe } from '@/lib/calendario/colores';
import { etiquetaCabecera, mostrarNombres, recortarNombre } from '@/lib/inicio/hiloPareja';
import { useEstado } from '@/lib/pareja/EstadoProvider';

const AVATAR = 38; // + anillo de 3 px por lado = 44
const NODO = 44;
const ANCHO_NOMBRE = 52;
const ANCHO_HILO = 28;
const ALTO_HILO = 10;
const GROSOR = 2;
const FASE_QUIETA = Math.PI / 2;
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Hilo ondulado entre los dos avatares: quieto por defecto; con movimiento permitido y la pestaña enfocada, una onda lenta en el hilo de UI. */
function Hilo({ unido }: { unido: boolean }) {
  const reducida = useReducedMotion();
  const enfocada = useIsFocused();
  const fase = useSharedValue(FASE_QUIETA);
  const anima = unido && !reducida && enfocada;
  useEffect(() => {
    if (!anima) {
      cancelAnimation(fase);
      fase.set(FASE_QUIETA);
      return;
    }
    fase.set(withRepeat(withTiming(FASE_QUIETA + 2 * Math.PI, { duration: 4000, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(fase);
  }, [anima, fase]);
  const props = useAnimatedProps(() => {
    const { xs, ys } = puntosOndaCarga(ANCHO_HILO, ALTO_HILO, GROSOR, fase.get(), 13);
    return { d: trazoDePuntos(xs, ys, xs.length) };
  });
  const ini = puntosOndaCarga(ANCHO_HILO, ALTO_HILO, GROSOR, FASE_QUIETA, 13);
  return (
    <View pointerEvents="none" style={styles.hilo}>
      <Svg width={ANCHO_HILO} height={ALTO_HILO}>
        <AnimatedPath
          d={trazoDePuntos(ini.xs, ini.ys, ini.xs.length)}
          fill="none"
          stroke={colors.accent}
          strokeWidth={GROSOR}
          strokeLinecap="round"
          strokeDasharray={unido ? undefined : '1 4'}
          opacity={unido ? 1 : 0.6}
          animatedProps={props}
        />
      </Svg>
    </View>
  );
}

function Nodo({ ancho, children, nombre, color }: { ancho: number; children: React.ReactNode; nombre: string | null; color: string }) {
  return (
    <View style={[styles.nodo, { width: ancho }]}>
      {children}
      {nombre !== null ? (
        <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={[styles.nombre, { color }]}>
          {nombre}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Cabecera del Inicio, lado derecho: los dos avatares (con anillo del color de cada uno) unidos por un hilo ondulado,
 * y bajo cada uno su nombre. Un solo botón a Ajustes. Sin pareja: «?» discontinuo, «Pendiente» y el hilo punteado.
 */
export function HiloPareja() {
  const router = useRouter();
  const { pareja } = useEstado();
  const { width, fontScale } = useWindowDimensions();
  if (!pareja) return null;
  const otra = pareja.otra;
  const nombres = mostrarNombres(width, fontScale);
  const ancho = nombres ? ANCHO_NOMBRE : NODO;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiquetaCabecera(pareja.yo.nombre, otra?.nombre ?? null)}
      onPress={() => router.push('/ajustes')}
      hitSlop={8}
      style={({ pressed }) => [styles.fila, pressed && { opacity: 0.7 }]}
    >
      <Nodo ancho={ancho} nombre={nombres ? recortarNombre(pareja.yo.nombre) : null} color={paletaDe(pareja.yo.color).borde}>
        <AvatarPersona nombre={pareja.yo.nombre} color={pareja.yo.color} avatarPath={pareja.yo.avatarPath} tamano={AVATAR} anillo />
      </Nodo>
      <Hilo unido={otra !== null} />
      <Nodo ancho={ancho} nombre={nombres ? (otra ? recortarNombre(otra.nombre) : 'Pendiente') : null} color={otra ? paletaDe(otra.color).borde : colors.textSecondary}>
        {otra ? (
          <AvatarPersona nombre={otra.nombre} color={otra.color} avatarPath={otra.avatarPath} tamano={AVATAR} anillo />
        ) : (
          <View style={styles.pendiente}>
            <Text style={styles.interrogante}>?</Text>
          </View>
        )}
      </Nodo>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 44 },
  nodo: { alignItems: 'center' },
  // Centrado en vertical con el avatar de 44 px.
  hilo: { height: NODO, justifyContent: 'center', marginHorizontal: -2 },
  nombre: { marginTop: 1, fontFamily: fonts.bodyBold, fontSize: 11, lineHeight: 14, maxWidth: ANCHO_NOMBRE },
  pendiente: {
    width: NODO,
    height: NODO,
    borderRadius: NODO / 2,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  interrogante: { fontFamily: fonts.titleBold, fontSize: 18, color: colors.textSecondary },
});
