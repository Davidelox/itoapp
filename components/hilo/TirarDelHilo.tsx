import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
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

import { radius, spacing } from '@/constants/theme';
import { crearEstilos } from '@/lib/tema';
import { trazoDePuntos } from './geometria';
import { hapticaLigera } from './haptics';
import { HiloFisico } from './HiloFisico';

const GROSOR = 2.5;
/** El hilo baja desde fuera de la pantalla, por encima del borde superior. */
const Y_ORIGEN = -24;
const PUNTOS = 30;
/** Centro del ojal por el que el hilo sujeta la tarjeta, medido desde su borde superior. */
const Y_OJAL = 9;

/** Tiempos de la ida (ms). */
const T_TENSAR = 190; // el hilo, ya descolgado hasta la tarjeta, se tensa
const T_SUBIR = 250; // la tarjeta empieza a subir
const T_LLEGADA = 760; // la tarjeta ya está en su sitio del detalle: se navega
const T_VUELTA = 680;

const MUELLE_TENSAR = { stiffness: 260, damping: 14, mass: 1 };
const MUELLE_VIAJE = { stiffness: 170, damping: 20, mass: 1 };
const MUELLE_VUELTA = { stiffness: 170, damping: 22, mass: 1 };

export type RectHilo = { x: number; y: number; width: number; height: number };

/** Sitio que ocupa la tarjeta en la pantalla de detalle, colgada del hilo. */
export function rectDeDetalle(ancho: number, superior: number): RectHilo {
  return { x: spacing.xl, y: superior + 104, width: ancho - 2 * spacing.xl, height: 132 };
}

/**
 * Atributo `d` del hilo que baja desde el borde superior hasta (x, yFin).
 * `dibujo`: 0-1, cuánto ha bajado. `holgura`: 0 = tirante, 1 = suelto y ondulado.
 */
function hiloDesdeArriba(x: number, yFin: number, dibujo: number, holgura: number): string {
  'worklet';
  const largo = yFin - Y_ORIGEN;
  // Un hilo corto no tiene de dónde ondular.
  const amplitud = 15 * holgura * Math.min(1, Math.max(largo, 0) / 220);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= PUNTOS; i++) {
    const s = (i / PUNTOS) * dibujo;
    xs.push(x + amplitud * Math.sin(Math.PI * s) * Math.sin(3 * Math.PI * s + 0.6));
    ys.push(Y_ORIGEN + largo * s);
  }
  return trazoDePuntos(xs, ys, PUNTOS + 1);
}

type Tiron = {
  /** Identifica la tarjeta: mientras dura la transición, `claveActiva` vale esto y la original debe ocultarse. */
  clave: string;
  /** Posición y tamaño de la tarjeta en la ventana (measureInWindow). */
  origen: RectHilo;
  /** La tarjeta tal como se ve, para llevarla hasta el detalle. Debe llenar su contenedor (flex: 1). */
  contenido: ReactNode;
  /** Navega al detalle. Se llama cuando la tarjeta ya está en su sitio. */
  ir: () => void;
};

type Fase = 'reposo' | 'yendo' | 'abierta' | 'volviendo';

/**
 * «Tirar del hilo»: al tocar una tarjeta, un hilo baja hasta ella, se tensa y tira: la tarjeta se
 * despega y sube hasta el sitio que ocupa en el detalle, mientras la pantalla se despeja. Entonces
 * se navega (sin animación de pila: el detalle empieza exactamente como acaba esta capa). Al volver,
 * el hilo la devuelve a su sitio, se destensa y se recoge.
 *
 * `overlay` hay que renderizarlo una vez, como último hijo de la pantalla (a pantalla completa), y
 * `alVolver` hay que llamarlo cuando la pantalla recupera el foco (useFocusEffect).
 */
export function useTirarDelHilo() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducida = useReducedMotion();
  const [activo, setActivo] = useState<{ clave: string; contenido: ReactNode } | null>(null);
  const fase = useRef<Fase>('reposo');
  const temporizadores = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Rectángulo de partida de la tarjeta, en la ventana.
  const ox = useSharedValue(0);
  const oy = useSharedValue(0);
  const ow = useSharedValue(0);
  const oh = useSharedValue(0);
  /** Cuánto ha bajado el hilo (0-1), su holgura (1 = suelto) y el viaje de la tarjeta (0 = lista, 1 = detalle). */
  const dibujo = useSharedValue(0);
  const holgura = useSharedValue(1);
  const viaje = useSharedValue(0);
  /** Sacudida de la tarjeta cuando el hilo se tensa. */
  const tiron = useSharedValue(0);

  const limpiar = useCallback(() => {
    temporizadores.current.forEach(clearTimeout);
    temporizadores.current = [];
  }, []);
  useEffect(() => limpiar, [limpiar]);

  const tirar = useCallback(
    ({ clave, origen, contenido, ir }: Tiron) => {
      if (reducida) {
        ir();
        return;
      }
      if (fase.current !== 'reposo') return; // toques repetidos: la transición en curso manda
      fase.current = 'yendo';
      const luego = (ms: number, fn: () => void) => temporizadores.current.push(setTimeout(fn, ms));

      ox.set(origen.x);
      oy.set(origen.y);
      ow.set(origen.width);
      oh.set(origen.height);
      viaje.set(0);
      tiron.set(0);
      holgura.set(1);
      dibujo.set(0);
      setActivo({ clave, contenido });

      // El hilo se descuelga hasta la tarjeta, se tensa (ahí se nota el tirón) y se la lleva.
      dibujo.set(withTiming(1, { duration: T_TENSAR + 20, easing: Easing.out(Easing.quad) }));
      holgura.set(withDelay(T_TENSAR, withSpring(0, MUELLE_TENSAR)));
      tiron.set(
        withDelay(T_TENSAR, withSequence(withTiming(1, { duration: 90 }), withSpring(0, { stiffness: 200, damping: 12 }))),
      );
      viaje.set(withDelay(T_SUBIR, withSpring(1, MUELLE_VIAJE)));
      luego(T_TENSAR, hapticaLigera);
      luego(T_LLEGADA, () => {
        fase.current = 'abierta';
        ir();
      });
    },
    [reducida, ox, oy, ow, oh, dibujo, holgura, viaje, tiron],
  );

  /** La pantalla vuelve a verse: si hay una tarjeta arriba, el hilo la devuelve a su sitio y se recoge. */
  const alVolver = useCallback(() => {
    if (fase.current !== 'abierta') return;
    fase.current = 'volviendo';
    viaje.set(withSpring(0, MUELLE_VUELTA));
    holgura.set(withDelay(240, withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) })));
    dibujo.set(withDelay(400, withTiming(0, { duration: 260, easing: Easing.in(Easing.cubic) })));
    temporizadores.current.push(
      setTimeout(() => {
        fase.current = 'reposo';
        setActivo(null);
      }, T_VUELTA),
    );
  }, [viaje, holgura, dibujo]);

  const destino = rectDeDetalle(width, insets.top);
  const overlay: ReactElement | null = activo ? (
    <CapaTiron
      contenido={activo.contenido}
      destino={destino}
      origen={{ x: ox, y: oy, width: ow, height: oh }}
      dibujo={dibujo}
      holgura={holgura}
      viaje={viaje}
      tiron={tiron}
    />
  ) : null;

  return { tirar, alVolver, overlay, claveActiva: activo ? activo.clave : null };
}

type CapaProps = {
  contenido: ReactNode;
  destino: RectHilo;
  origen: { x: SharedValue<number>; y: SharedValue<number>; width: SharedValue<number>; height: SharedValue<number> };
  dibujo: SharedValue<number>;
  holgura: SharedValue<number>;
  viaje: SharedValue<number>;
  tiron: SharedValue<number>;
};

/** Capa a pantalla completa con la tarjeta en tránsito, el hilo que tira de ella y el fondo que se despeja. */
function CapaTiron({ contenido, destino, origen, dibujo, holgura, viaje, tiron }: CapaProps) {
  const styles = useStyles();
  const { width, height } = useWindowDimensions();
  const grosor = useSharedValue(GROSOR);

  const tarjetaStyle = useAnimatedStyle(() => {
    const v = viaje.value;
    return {
      left: origen.x.value + (destino.x - origen.x.value) * v,
      top: origen.y.value + (destino.y - origen.y.value) * v,
      width: origen.width.value + (destino.width - origen.width.value) * v,
      height: Math.max(origen.height.value + (destino.height - origen.height.value) * v, 1),
      // Al tensarse el hilo, la tarjeta da un respingo hacia arriba y se despega del papel.
      transform: [{ translateY: -5 * tiron.value }, { scale: 1 + 0.012 * tiron.value }],
    };
  });
  const sombraStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, 1 - holgura.value)),
  }));
  // El ojal aparece con el hilo que llega a él y se va con el hilo que se recoge.
  const ojalStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, dibujo.value * 2 - 1)) }));
  const fondoStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, viaje.value * 1.6)) }));

  const d = useDerivedValue(() => {
    const v = viaje.value;
    const x = origen.x.value + (destino.x - origen.x.value) * v + (origen.width.value + (destino.width - origen.width.value) * v) / 2;
    const y = origen.y.value + (destino.y - origen.y.value) * v - 5 * tiron.value;
    return hiloDesdeArriba(x, y + Y_OJAL, dibujo.value, holgura.value);
  });
  const elevacion = useDerivedValue(() => Math.min(Math.max(holgura.value, 0), 1));

  return (
    <View style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.fondo, fondoStyle]} />
      <Animated.View style={[styles.tarjeta, tarjetaStyle]}>
        <Animated.View style={[styles.sombra, sombraStyle]} />
        <View style={styles.contenido}>{contenido}</View>
        <Animated.View style={[styles.ojal, ojalStyle]}>
          <View style={styles.ojalHueco} />
        </Animated.View>
      </Animated.View>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <HiloFisico d={d} grosor={grosor} grosorBase={GROSOR} sombra={elevacion} />
      </Svg>
    </View>
  );
}

/**
 * En la pantalla de detalle: la tarjeta colgada del hilo, exactamente donde la deja la transición
 * (rectDeDetalle). `children` es la tarjeta y debe llenar su contenedor (flex: 1).
 */
export function TarjetaColgada({ rect, children }: { rect: RectHilo; children: ReactNode }) {
  const styles = useStyles();
  const { width, height } = useWindowDimensions();
  const grosor = useSharedValue(GROSOR);
  const x = rect.x + rect.width / 2;
  const y = rect.y + Y_OJAL;
  const d = useDerivedValue(() => hiloDesdeArriba(x, y, 1, 0));
  return (
    <>
      <View style={[styles.tarjeta, { left: rect.x, top: rect.y, width: rect.width, height: rect.height }]}>
        <View style={styles.sombra} />
        <View style={styles.contenido}>{children}</View>
        <View style={styles.ojal}>
          <View style={styles.ojalHueco} />
        </View>
      </View>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <HiloFisico d={d} grosor={grosor} grosorBase={GROSOR} />
      </Svg>
    </>
  );
}

const useStyles = crearEstilos((colors) => ({
  fondo: { ...StyleSheet.absoluteFill, backgroundColor: colors.background },
  tarjeta: { position: 'absolute' },
  contenido: { flex: 1 },
  ojal: {
    position: 'absolute',
    top: Y_OJAL - 5,
    alignSelf: 'center',
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.2,
    borderColor: colors.inputBorder,
    backgroundColor: colors.segmented,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ojalHueco: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.inputBorder },
  // Sombra de la tarjeta mientras el hilo la sostiene en el aire.
  sombra: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.lg,
    boxShadow: '0px 8px 20px rgba(94, 26, 38, 0.14)',
  },
}));
