import { Tabs } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { colors, fonts } from '@/constants/theme';
import { hapticaLigera } from './haptics';
import { HiloTrazo } from './trazo';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ANCHO_HILO = 56;
const ALTO_HILO = 16;
// Línea con un rizo pequeño en el centro; el rizo se dibuja al llegar.
const LINEA = 'M 2 11 L 54 11';
const RIZO = 'M 16 11 C 24 11, 30 3, 27 2 C 23 1, 22 10, 32 11 L 36 11';

export function TabBarHilo({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reducida = useReducedMotion();
  const [ancho, setAncho] = useState(0);
  const anchoTab = ancho / state.routes.length;

  const x = useSharedValue(0);
  const arco = useSharedValue(0);
  const rizo = useSharedValue(1);
  const colocado = useRef(false);
  const anterior = useRef(state.index);

  useEffect(() => {
    if (!ancho) return;
    const destino = state.index * anchoTab + anchoTab / 2 - ANCHO_HILO / 2;
    if (!colocado.current || reducida) {
      colocado.current = true;
      x.value = destino;
      rizo.value = 1;
      anterior.current = state.index;
      return;
    }
    if (anterior.current !== state.index) hapticaLigera();
    anterior.current = state.index;
    rizo.value = 0;
    arco.value = 0;
    x.value = withTiming(destino, { duration: 320, easing: Easing.bezier(0.4, 0, 0.2, 1) });
    arco.value = withTiming(1, { duration: 320, easing: Easing.linear }, (fin) => {
      if (fin) rizo.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.quad) });
    });
  }, [state.index, ancho, anchoTab, reducida, x, arco, rizo]);

  const hiloStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: -Math.sin(arco.value * Math.PI) * 5 }],
  }));

  return (
    <View
      style={[styles.barra, { paddingBottom: insets.bottom }]}
      onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
    >
      <Animated.View pointerEvents="none" style={[styles.hilo, hiloStyle]}>
        <Svg width={ANCHO_HILO} height={ALTO_HILO} viewBox={`0 0 ${ANCHO_HILO} ${ALTO_HILO}`}>
          <Path d={LINEA} stroke={colors.accent} strokeWidth={2} strokeLinecap="round" fill="none" />
          <HiloTrazo d={RIZO} progress={rizo} strokeWidth={2} />
        </Svg>
      </Animated.View>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const enfocada = state.index === index;
        const color = enfocada ? colors.accent : colors.textSecondary;
        const titulo = options.title ?? route.name;
        const alPulsar = () => {
          const evento = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!enfocada && !evento.defaultPrevented) navigateToTab(route.key);
        };
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: enfocada }}
            accessibilityLabel={titulo}
            onPress={alPulsar}
            style={styles.tab}
          >
            {options.tabBarIcon?.({ focused: enfocada, color, size: 24 })}
            <Text style={[styles.etiqueta, { color }]} numberOfLines={1}>
              {titulo}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 10, paddingBottom: 6, gap: 3 },
  etiqueta: { fontFamily: fonts.bodyMedium, fontSize: 11 },
  // Cabalga sobre el borde superior de la barra.
  hilo: { position: 'absolute', top: -ALTO_HILO + 6, left: 0, zIndex: 2 },
});
