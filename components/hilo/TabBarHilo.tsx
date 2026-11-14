import { Tabs } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentProps, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  cancelAnimation,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg from 'react-native-svg';

import { colors, fonts } from '@/constants/theme';
import { trazoDePuntos } from './geometria';
import { hapticaLigera } from './haptics';
import { HiloFisico } from './HiloFisico';
import {
  ANCHO_INDICADOR,
  GROSOR_INDICADOR,
  alEntregarHilo,
  hayEntregaPendiente,
  publicarAncla,
  registrarMedidor,
} from './relevo';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Lienzo del hilo: ocupa todo el ancho de la barra y cabalga sobre su borde superior. */
const ALTO_LIENZO = 30;
const Y_HILO = 20;
/** Puntos con los que se dibuja el hilo en cada fotograma. */
const PUNTOS = 44;
/** Rizo del hilo en reposo: radio del bucle y media anchura del tramo que lo forma. */
const RADIO_RIZO = 4.4;
const MEDIO_RIZO = 7;
/** Hilo de más (px) con el que la holgura es máxima: a partir de ahí ondula con toda su amplitud. */
const HOLGURA_COMPLETA = 60;

const MUELLE_PUNTA = { stiffness: 190, damping: 26, mass: 1 };
const MUELLE_RIZO = { stiffness: 240, damping: 13, mass: 1 };

const entre = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * Barra de pestañas con el hilo de ito como indicador: descansa bajo la pestaña activa con un rizo
 * y, al cambiar de pestaña, viaja por el borde de la barra pasando por las intermedias. La punta
 * guía con un muelle firme, la cola la sigue con uno más blando, el hilo sobrante ondula (cada
 * viaje con una ondulación algo distinta) y al llegar se tensa y vuelve a hacer el rizo.
 */
export function TabBarHilo({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reducida = useReducedMotion();
  const [ancho, setAncho] = useState(0);
  const anchoTab = ancho / state.routes.length;
  const lienzoRef = useRef<ComponentRef<typeof View>>(null);

  // Extremos izquierdo y derecho del hilo, en píxeles de la barra.
  const izq = useSharedValue(0);
  const der = useSharedValue(ANCHO_INDICADOR);
  /** 0 = hilo recto, 1 = rizo hecho. Mientras el splash no entrega el hilo, espera recto. */
  const rizo = useSharedValue(hayEntregaPendiente() ? 0 : 1);
  // Carácter de la ondulación de cada viaje.
  const amplitud = useSharedValue(3.5);
  const arco = useSharedValue(3);
  const ondas = useSharedValue(1.3);
  const fase = useSharedValue(0);
  const grosor = useSharedValue(GROSOR_INDICADOR);

  const colocado = useRef(false);
  const centroAnterior = useRef(0);
  const indiceAnterior = useRef(state.index);

  /** Publica dónde descansa el hilo, para que el splash lo deje exactamente ahí. */
  const publicar = useCallback(() => {
    if (!ancho) return;
    const centro = state.index * anchoTab + anchoTab / 2;
    lienzoRef.current?.measureInWindow((x, y) => publicarAncla({ x: x + centro, y: y + Y_HILO }));
  }, [ancho, anchoTab, state.index]);

  // El splash puede pedir una medida fresca; y si cambia la zona segura, la barra se ha movido.
  useEffect(() => registrarMedidor(publicar), [publicar]);
  useEffect(() => {
    publicar();
  }, [publicar, insets.bottom]);

  useEffect(() => {
    if (!ancho) return;
    const centro = state.index * anchoTab + anchoTab / 2;
    const izqDestino = centro - ANCHO_INDICADOR / 2;
    const derDestino = centro + ANCHO_INDICADOR / 2;
    publicar();

    if (!colocado.current || reducida) {
      // Primera colocación o movimiento reducido: el hilo aparece ya en su sitio.
      colocado.current = true;
      cancelAnimation(izq);
      cancelAnimation(der);
      izq.value = izqDestino;
      der.value = derDestino;
      centroAnterior.current = centro;
      indiceAnterior.current = state.index;
      return;
    }
    if (centro === centroAnterior.current) return;
    if (indiceAnterior.current !== state.index) hapticaLigera();

    const distancia = Math.abs(centro - centroAnterior.current);
    const haciaLaDerecha = centro > centroAnterior.current;
    centroAnterior.current = centro;
    indiceAnterior.current = state.index;

    // Cada viaje ondula a su manera: variación contenida, nunca un salto brusco de forma.
    const suavizado = { duration: 160 };
    amplitud.value = withTiming(entre(2.6, 4.6) * (Math.random() < 0.5 ? -1 : 1), suavizado);
    arco.value = withTiming(entre(1.5, 4.5), suavizado);
    ondas.value = withTiming(entre(0.9, 1.7), suavizado);
    fase.value = withTiming(entre(0, Math.PI * 2), suavizado);

    // La punta guía y la cola la sigue con retraso. Los muelles conservan la velocidad si se cambia
    // de destino a mitad de un viaje, así que los toques rápidos no dan tirones.
    const rigidezCola = entre(62, 86);
    const muelleCola = { stiffness: rigidezCola, damping: 1.8 * Math.sqrt(rigidezCola), mass: 1 };
    izq.value = withSpring(izqDestino, haciaLaDerecha ? muelleCola : MUELLE_PUNTA);
    der.value = withSpring(derDestino, haciaLaDerecha ? MUELLE_PUNTA : muelleCola);

    // El rizo se deshace al tirar del hilo y se rehace, con un rebote mínimo, cuando la cola llega.
    const llegada = Math.min(640, 300 + distancia * 0.55);
    rizo.value = withSequence(withTiming(0, { duration: 110 }), withDelay(llegada, withSpring(1, MUELLE_RIZO)));
  }, [state.index, ancho, anchoTab, reducida, publicar, izq, der, rizo, amplitud, arco, ondas, fase]);

  // Relevo del splash: cuando deja el hilo recto sobre la barra, aquí se hace el rizo.
  useEffect(() => {
    if (!hayEntregaPendiente()) return;
    return alEntregarHilo(() => {
      rizo.value = reducida ? withTiming(1, { duration: 200 }) : withSpring(1, MUELLE_RIZO);
    });
  }, [rizo, reducida]);

  const d = useDerivedValue(() => {
    const a = izq.value;
    const largo = Math.max(der.value - a, 6);
    // Holgura: el hilo que sobra respecto a su largo en reposo. Con ella ondula; sin ella queda tenso.
    const holgura = Math.min(Math.max((largo - ANCHO_INDICADOR) / HOLGURA_COMPLETA, 0), 1);
    const radio = RADIO_RIZO * rizo.value * (1 - holgura) * (1 - holgura);
    const centro = a + largo / 2;
    // La onda corre por el hilo según avanza y se detiene con él.
    const faseOnda = fase.value + centro * 0.09;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i <= PUNTOS; i++) {
      const s = i / PUNTOS;
      const sujeto = Math.sin(Math.PI * s); // los extremos no ondulan
      let x = a + largo * s;
      let y =
        Y_HILO -
        arco.value * holgura * sujeto +
        amplitud.value * holgura * sujeto * Math.sin(2 * Math.PI * ondas.value * s + faseOnda);
      const dx = x - centro;
      if (dx > -MEDIO_RIZO && dx < MEDIO_RIZO) {
        const giro = ((dx + MEDIO_RIZO) / (2 * MEDIO_RIZO)) * 2 * Math.PI;
        x += radio * Math.sin(giro);
        y -= radio * (1 - Math.cos(giro));
      }
      xs.push(x);
      ys.push(y);
    }
    return trazoDePuntos(xs, ys, PUNTOS + 1);
  });

  return (
    <View
      style={[styles.barra, { paddingBottom: insets.bottom }]}
      onLayout={(e) => {
        setAncho(e.nativeEvent.layout.width);
        publicar(); // también cuando solo cambia el alto o la posición de la barra
      }}
    >
      <View ref={lienzoRef} pointerEvents="none" style={styles.hilo} onLayout={publicar}>
        {ancho > 0 ? (
          <Svg width={ancho} height={ALTO_LIENZO}>
            <HiloFisico d={d} grosor={grosor} grosorBase={GROSOR_INDICADOR} />
          </Svg>
        ) : null}
      </View>
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
  // El hilo descansa justo bajo el borde superior de la barra; el lienzo sobresale para la ondulación y el rizo.
  hilo: { position: 'absolute', top: 1 - Y_HILO, left: 0, right: 0, height: ALTO_LIENZO, zIndex: 2 },
});
