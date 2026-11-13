import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { colors } from '@/constants/theme';
import { suave, trazoEntre } from './geometria';
import { hapticaLigera } from './haptics';
import { HiloFisico } from './HiloFisico';
import { ITO_LOGOTIPO, ITO_LOGOTIPO_CAJA } from './marca';
import { entregarHilo, leerAncla, suscribirAncla } from './relevo';
import {
  T_RECOGIDO,
  T_REPOSO,
  T_TENSAR,
  TOTAL_MS,
  cabezaEn,
  colaEn,
  destelloEn,
  elevacionLogoEn,
  escenaSplash,
  fondoEn,
  grosorEn,
  holguraEn,
  opacidadHiloEn,
  opacidadLogoEn,
} from './splashCoreografia';

/** Margen alrededor del logotipo, en unidades del icono, para que su sombra no se recorte. */
const MARGEN_LOGO = 2;
const CAJA_LOGO = [
  ITO_LOGOTIPO_CAJA.x - MARGEN_LOGO,
  ITO_LOGOTIPO_CAJA.y - MARGEN_LOGO,
  ITO_LOGOTIPO_CAJA.ancho + 2 * MARGEN_LOGO,
  ITO_LOGOTIPO_CAJA.alto + 2 * MARGEN_LOGO,
].join(' ');

type Props = {
  onDone: () => void;
  /** La animación se relanza con la app ya visible (laboratorio): la capa entra con un fundido. */
  relanzada?: boolean;
};

/**
 * Capa a pantalla completa del arranque: un hilo físico entra por la izquierda, traza el tirabuzón
 * del icono sobre «ito», sale por el borde derecho, vuelve a entrar por abajo a la derecha y recorre
 * la barra de pestañas hasta su pestaña. Allí se tensa (y «ito», que estaba levantado del papel, se
 * posa con él) y se recoge mientras aparece la app, hasta entregar el tramo final al hilo de la barra.
 * Tiempos en splashCoreografia.ts. Se salta al tocar.
 * Con «Reducir movimiento» no hay recorrido: el hilo en reposo aparece y se va con un fundido.
 */
export function SplashHilo({ onDone, relanzada = false }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducida = useReducedMotion();
  // Dónde descansa el hilo de la barra de pestañas, medido por la propia barra.
  const ancla = useSyncExternalStore(suscribirAncla, leerAncla, leerAncla);

  const escena = useMemo(
    () => escenaSplash({ ancho: width, alto: height, inferior: insets.bottom, ancla }),
    [width, height, insets.bottom, ancla],
  );
  const { recorrido, indiceIcono, puntosIndicador, puntosDestello, grosor: grosorTenso } = escena;
  const ultimo = recorrido.tx.length - 1;

  /** Reloj de la coreografía, en milisegundos. */
  const reloj = useSharedValue(reducida ? T_REPOSO : 0);
  const entrada = useSharedValue(relanzada ? 0 : 1);
  /** Opacidad de toda la capa al irse: al saltar la animación o al acabar la versión reducida. */
  const salida = useSharedValue(1);
  const fundidoReducido = useSharedValue(0);
  const terminado = useRef(false);

  /** La barra de pestañas toma el relevo del hilo. Solo en el arranque, no al relanzar desde el laboratorio. */
  const entregar = useCallback(() => {
    if (!relanzada) entregarHilo();
  }, [relanzada]);

  const terminar = useCallback(() => {
    if (terminado.current) return;
    terminado.current = true;
    entregar();
    onDone();
  }, [onDone, entregar]);

  useEffect(() => {
    const retraso = relanzada ? 140 : 0;
    if (relanzada) entrada.value = withTiming(1, { duration: 180 });
    if (reducida) {
      fundidoReducido.value = withDelay(retraso, withTiming(1, { duration: 220 }));
      salida.value = withDelay(
        retraso + 920,
        withTiming(0, { duration: 240 }, (fin) => {
          if (fin) scheduleOnRN(terminar);
        }),
      );
      return;
    }
    reloj.value = withDelay(
      retraso,
      withTiming(TOTAL_MS, { duration: TOTAL_MS, easing: Easing.linear }, (fin) => {
        if (fin) scheduleOnRN(terminar);
      }),
    );
  }, [reducida, relanzada, reloj, entrada, fundidoReducido, salida, terminar]);

  const saltar = () => {
    cancelAnimation(reloj);
    cancelAnimation(salida);
    salida.set(withTiming(0, { duration: 150 }, () => scheduleOnRN(terminar)));
  };

  // El tirón se nota en la mano justo cuando el hilo se tensa (solo en nativo).
  useAnimatedReaction(
    () => reloj.value >= T_TENSAR,
    (tensado, antes) => {
      if (tensado && antes === false) scheduleOnRN(hapticaLigera);
    },
  );
  // Cuando solo queda el tramo del indicador, la barra de pestañas toma el relevo y hace su rizo.
  useAnimatedReaction(
    () => reloj.value >= T_RECOGIDO,
    (recogido, antes) => {
      if (recogido && antes === false) scheduleOnRN(entregar);
    },
  );

  const holgura = useDerivedValue(() => holguraEn(reloj.value));
  const cabeza = useDerivedValue(() => cabezaEn(reloj.value, ultimo, indiceIcono));
  const cola = useDerivedValue(() => colaEn(reloj.value, ultimo, puntosIndicador));
  // Una sola cadena `d` por fotograma para todas las capas del hilo, y otra corta para el destello.
  const d = useDerivedValue(() => trazoEntre(recorrido, holgura.value, cola.value, cabeza.value));
  const dPunta = useDerivedValue(() =>
    trazoEntre(recorrido, holgura.value, Math.max(cola.value, cabeza.value - puntosDestello), cabeza.value),
  );
  const grosor = useDerivedValue(() => grosorEn(reloj.value, grosorTenso, holgura.value));
  const destello = useDerivedValue(() => destelloEn(reloj.value));
  const elevacion = useDerivedValue(() => Math.min(Math.max(holgura.value, 0), 1));
  // «ito» está levantado del papel mientras el hilo recorre la pantalla y se posa con él al tensarse.
  const elevacionLogo = useDerivedValue(() => elevacionLogoEn(reloj.value, holgura.value));

  const capaStyle = useAnimatedStyle(() => ({ opacity: salida.value * entrada.value }));
  const fondoStyle = useAnimatedStyle(() => ({ opacity: fondoEn(reloj.value) }));
  const hiloStyle = useAnimatedStyle(() => ({
    opacity: reducida ? fundidoReducido.value : opacidadHiloEn(reloj.value),
  }));
  const logoStyle = useAnimatedStyle(() => {
    // En nativo «ito» ya está en pantalla (viene del splash del sistema); en web aparece con un fundido.
    const aparece = Platform.OS === 'web' && !relanzada ? suave(reloj.value / 220) : 1;
    return { opacity: aparece * opacidadLogoEn(reloj.value) };
  });
  const letrasStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -0.5 * elevacionLogo.value }, { translateY: -3 * elevacionLogo.value }],
  }));
  // Las sombras se quedan en el papel: se abren al despegar el logo y se recogen bajo él al posarse.
  const sombraCercanaStyle = useAnimatedStyle(() => {
    const e = Math.max(0, elevacionLogo.value);
    return { opacity: 0.13 * Math.min(1, 3 * e), transform: [{ translateX: 0.9 * e }, { translateY: 2.4 * e }] };
  });
  const sombraAnchaStyle = useAnimatedStyle(() => {
    const e = Math.max(0, elevacionLogo.value);
    return { opacity: 0.09 * Math.min(1, 3 * e), transform: [{ translateX: 2 * e }, { translateY: 5.2 * e }] };
  });

  const margenLogo = (MARGEN_LOGO * escena.logo.width) / ITO_LOGOTIPO_CAJA.ancho;
  const anchoLogo = escena.logo.width + 2 * margenLogo;
  const altoLogo = escena.logo.height + 2 * margenLogo;
  const cajaLogoStyle = {
    left: escena.logo.left - margenLogo,
    top: escena.logo.top - margenLogo,
    width: anchoLogo,
    height: altoLogo,
  };

  return (
    <Animated.View style={[styles.capa, capaStyle]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View style={[styles.fondo, fondoStyle]} />
        <Animated.View style={[styles.logo, cajaLogoStyle, logoStyle]}>
          <Animated.View style={[StyleSheet.absoluteFill, sombraAnchaStyle]}>
            <Svg width={anchoLogo} height={altoLogo} viewBox={CAJA_LOGO}>
              <Path
                d={ITO_LOGOTIPO}
                fill={colors.accentDark}
                stroke={colors.accentDark}
                strokeWidth={1.6}
                strokeLinejoin="round"
              />
            </Svg>
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, sombraCercanaStyle]}>
            <Svg width={anchoLogo} height={altoLogo} viewBox={CAJA_LOGO}>
              <Path d={ITO_LOGOTIPO} fill={colors.accentDark} />
            </Svg>
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, letrasStyle]}>
            <Svg width={anchoLogo} height={altoLogo} viewBox={CAJA_LOGO}>
              <Path d={ITO_LOGOTIPO} fill={colors.accent} />
            </Svg>
          </Animated.View>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, hiloStyle]}>
          <Svg width={width} height={height}>
            <HiloFisico
              d={d}
              dPunta={dPunta}
              grosor={grosor}
              grosorBase={grosorTenso}
              destello={destello}
              sombra={elevacion}
            />
          </Svg>
        </Animated.View>
      </View>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={saltar}
        accessibilityRole="button"
        accessibilityLabel="Saltar animación de inicio"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  capa: { ...StyleSheet.absoluteFill, zIndex: 1000 },
  fondo: { ...StyleSheet.absoluteFill, backgroundColor: colors.background },
  logo: { position: 'absolute' },
});
