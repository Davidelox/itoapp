import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg from 'react-native-svg';

import { fonts, radius } from '@/constants/theme';
import { crearEstilos } from '@/lib/tema';
import { type Punto, curvasPorPuntos, muestrearRecorrido } from './geometria';
import { hapticaError, hapticaExito, hapticaLigera } from './haptics';
import { HiloFisico } from './HiloFisico';
import { NUDO_FLOJO, cortesDelNudo, extremosDelNudo, tramosVisibles } from './nudo';

const ALTO = 52;
const GROSOR = 1.9;
/** Ancho que ocupa el nudo ya apretado, con sus dos cabos cortos, y su separación del texto. */
const ANCHO_NUDO = 29;
const SEPARACION = 6;
/** El nudo apretado no queda centrado en su lienzo: cae un poco a la derecha. */
const DESCENTRE_NUDO = 1.6;

/** Al apretarse, el nudo se encoge hacia este punto y los cabos quedan rectos. */
const CENTRO_NUDO: Punto = [1, -2];
const ESCALA_APRETADO = 0.36;
/** Tamaño del nudo abierto respecto al dibujo de arriba. */
const ESCALA_FLOJO = 1.4;

/** Recorrido del hilo por el botón: flojo (nudo abierto) y tenso (nudo apretado), con la misma estructura. */
function recorridoDelNudo(ancho: number) {
  const cx = ancho / 2;
  const cy = ALTO / 2 + 1;
  const borde = ancho / 2 + 12; // los cabos entran y salen por fuera del botón
  const flojo: Punto[] = [
    [-borde, 0],
    ...NUDO_FLOJO.map((p): Punto => [p[0] * ESCALA_FLOJO, p[1] * ESCALA_FLOJO]),
    [borde, 0],
  ];
  const tenso: Punto[] = flojo.map((p, i) => {
    if (i === 0 || i === flojo.length - 1) return p;
    if (i === 1) return [-16, 0.2];
    if (i === flojo.length - 2) return [20, 0];
    return [
      CENTRO_NUDO[0] + (p[0] - CENTRO_NUDO[0]) * ESCALA_APRETADO,
      CENTRO_NUDO[1] + 1.6 + (p[1] - CENTRO_NUDO[1]) * ESCALA_APRETADO,
    ];
  });
  const aPantalla = (p: Punto): Punto => [cx + p[0], cy + p[1]];
  const recorrido = muestrearRecorrido(
    curvasPorPuntos(tenso.map(aPantalla)),
    curvasPorPuntos(flojo.map(aPantalla)),
    1.8,
  );
  const ultimo = recorrido.tx.length - 1;
  const [entrada, salida] = extremosDelNudo(recorrido.marcas, 1);
  return {
    recorrido,
    ultimo,
    cortes: cortesDelNudo(recorrido.marcas, 1, ultimo),
    // Cabos cortos que conserva el nudo una vez apretado.
    cabos: [entrada - 9 / recorrido.paso, salida + 9 / recorrido.paso],
  };
}

type Fase = 'reposo' | 'atando' | 'esperando' | 'hecho' | 'error';

type Props = {
  label: string;
  /** Texto que confirma la acción cuando el nudo se aprieta. */
  labelHecho?: string;
  /** Texto si la acción falla y el nudo se suelta. */
  labelError?: string;
  /**
   * Acción del botón. Si devuelve una promesa, el hilo espera con el nudo abierto hasta que termine:
   * si se cumple, el nudo se aprieta; si se rechaza, se suelta.
   */
  onPress?: () => void | Promise<unknown>;
  /** Alternativa a la promesa: mientras sea true tras pulsar, el hilo espera con el nudo abierto. */
  guardando?: boolean;
  /** Con `guardando`: si al terminar la espera es true, el nudo se suelta en vez de apretarse. */
  error?: boolean;
  /** Se llama en el instante en que el nudo se aprieta. */
  onHecho?: () => void;
  disabled?: boolean;
};

/**
 * Botón principal que confirma con un nudo: al pulsarlo, un hilo cruza el botón y se anuda (pasa
 * por encima y por debajo de sí mismo), se aprieta con un tirón y deja el nudo junto al texto de
 * confirmación. Si la acción tarda, el nudo espera abierto; si falla, se suelta.
 * Con «Reducir movimiento» solo cambian los textos, con un fundido.
 */
export function BotonNudo({
  label,
  labelHecho = 'Guardado',
  labelError = 'No se ha podido guardar',
  onPress,
  guardando = false,
  error = false,
  onHecho,
  disabled = false,
}: Props) {
  const styles = useStyles();
  const reducida = useReducedMotion();
  const [fase, setFase] = useState<Fase>('reposo');
  const [ancho, setAncho] = useState(0);
  const [anchoHecho, setAnchoHecho] = useState(70);

  const escena = useMemo(() => recorridoDelNudo(Math.max(ancho, 120)), [ancho]);
  const { recorrido, ultimo, cortes, cabos } = escena;

  // Estado que consultan los temporizadores y las promesas sin esperar a un render.
  const faseRef = useRef<Fase>('reposo');
  const resultado = useRef<'ninguno' | 'pendiente' | 'bien' | 'mal'>('ninguno');
  const atadoListo = useRef(false);
  const pulsacion = useRef(0);
  const montado = useRef(true);
  const temporizadores = useRef<ReturnType<typeof setTimeout>[]>([]);
  const props = useRef({ guardando, error, onHecho });
  useEffect(() => {
    props.current = { guardando, error, onHecho };
  });

  /** Hasta dónde ha llegado la punta (0-1) y cuánta holgura tiene el nudo (1 = abierto, 0 = apretado). */
  const dibujo = useSharedValue(0);
  const holgura = useSharedValue(1);
  /** 0 = el hilo cruza todo el botón; 1 = solo queda el nudo con sus cabos cortos. */
  const recorte = useSharedValue(0);
  const desliz = useSharedValue(0);
  const opacidadHilo = useSharedValue(0);
  const texto = useSharedValue(1);
  const presion = useSharedValue(0);
  const sacudida = useSharedValue(0);
  const grosor = useSharedValue(GROSOR);

  useEffect(() => {
    montado.current = true;
    const ts = temporizadores;
    return () => {
      montado.current = false;
      ts.current.forEach(clearTimeout);
    };
  }, []);

  const luego = useCallback((ms: number, fn: () => void) => {
    temporizadores.current.push(
      setTimeout(() => {
        if (montado.current) fn();
      }, ms),
    );
  }, []);

  const cambiarFase = useCallback((nueva: Fase) => {
    faseRef.current = nueva;
    setFase(nueva);
  }, []);

  const anunciar = (mensaje: string) => {
    // En Android y web lo anuncia la región viva del texto; en iOS hay que pedirlo.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(mensaje);
  };

  /** Fundido del texto: se oculta, cambia de fase y vuelve a aparecer. */
  const relevarTexto = useCallback(
    (nueva: Fase, despues?: () => void) => {
      texto.set(withTiming(0, { duration: 120 }));
      luego(120, () => {
        cambiarFase(nueva);
        texto.set(withTiming(1, { duration: 180 }));
        despues?.();
      });
    },
    [texto, luego, cambiarFase],
  );

  const volverAlReposo = useCallback(
    (espera: number) => {
      luego(espera, () => {
        opacidadHilo.set(withTiming(0, { duration: 160 }));
        relevarTexto('reposo', () => {
          resultado.current = 'ninguno';
          atadoListo.current = false;
        });
      });
    },
    [luego, opacidadHilo, relevarTexto],
  );

  /** El nudo se aprieta: tirón, confirmación y el nudo se queda junto al texto. */
  const apretar = useCallback(() => {
    if (faseRef.current === 'hecho' || faseRef.current === 'error') return;
    faseRef.current = 'hecho';
    props.current.onHecho?.();
    if (reducida) {
      hapticaExito();
      relevarTexto('hecho', () => anunciar(labelHecho));
      volverAlReposo(1500);
      return;
    }
    cancelAnimation(holgura);
    holgura.set(withSpring(0, { stiffness: 260, damping: 15, mass: 1 }));
    luego(90, hapticaExito); // coincide con el tirón del muelle
    luego(170, () => {
      // Los cabos se recogen y el nudo se aparta para dejar sitio a la confirmación.
      recorte.set(withTiming(1, { duration: 280, easing: Easing.inOut(Easing.cubic) }));
      // El nudo apretado queda a la izquierda del texto, con el conjunto centrado en el botón.
      desliz.set(withSpring(-(anchoHecho / 2 + SEPARACION / 2 + DESCENTRE_NUDO), {
        stiffness: 170,
        damping: 20,
        mass: 1,
      }));
      setFase('hecho');
      anunciar(labelHecho);
    });
    // El texto de confirmación aparece cuando los cabos ya casi se han recogido.
    luego(360, () => texto.set(withTiming(1, { duration: 220 })));
    volverAlReposo(1750);
  }, [reducida, holgura, recorte, desliz, texto, anchoHecho, labelHecho, luego, relevarTexto, volverAlReposo]);

  /** El nudo no llega a apretarse: se abre, el hilo se escurre y el botón lo acusa. */
  const soltar = useCallback(() => {
    if (faseRef.current === 'hecho' || faseRef.current === 'error') return;
    faseRef.current = 'error';
    hapticaError();
    if (reducida) {
      relevarTexto('error', () => anunciar(labelError));
      volverAlReposo(2200);
      return;
    }
    cancelAnimation(holgura);
    holgura.set(withTiming(1.3, { duration: 200, easing: Easing.out(Easing.quad) }));
    dibujo.set(withTiming(0, { duration: 380, easing: Easing.in(Easing.cubic) }));
    sacudida.set(withSequence(
      withTiming(-5, { duration: 60 }),
      withTiming(4, { duration: 80 }),
      withTiming(-2, { duration: 80 }),
      withTiming(0, { duration: 80 }),
    ));
    luego(300, () => {
      setFase('error');
      texto.set(withTiming(1, { duration: 200 }));
      anunciar(labelError);
    });
    volverAlReposo(2400);
  }, [reducida, holgura, dibujo, sacudida, texto, labelError, luego, relevarTexto, volverAlReposo]);

  /** Decide qué hacer cuando el nudo ya está atado y se conoce (o no) el resultado. */
  const resolver = useCallback(() => {
    if (!atadoListo.current) return;
    if (faseRef.current !== 'atando' && faseRef.current !== 'esperando') return;
    const { guardando: sigueGuardando, error: hayError } = props.current;
    if (resultado.current === 'pendiente' || sigueGuardando) {
      if (faseRef.current !== 'esperando') {
        cambiarFase('esperando');
        // Mientras espera, el nudo respira: se afloja y se recoge sin llegar a cerrarse.
        if (!reducida) {
          holgura.set(withRepeat(
            withSequence(
              withTiming(0.62, { duration: 620, easing: Easing.inOut(Easing.sin) }),
              withTiming(1, { duration: 620, easing: Easing.inOut(Easing.sin) }),
            ),
            -1,
          ));
        }
      }
      return;
    }
    if (resultado.current === 'mal' || (resultado.current === 'ninguno' && hayError)) soltar();
    else apretar();
  }, [reducida, holgura, cambiarFase, apretar, soltar]);

  // Con la prop `guardando`: cuando deja de ser true, la espera termina.
  useEffect(() => {
    if (!guardando) resolver();
  }, [guardando, resolver]);

  const pulsar = () => {
    if (disabled || faseRef.current !== 'reposo') return;
    const turno = ++pulsacion.current;
    cambiarFase('atando');
    atadoListo.current = false;
    resultado.current = 'ninguno';
    hapticaLigera();

    let devuelto: Promise<unknown> | undefined;
    try {
      devuelto = onPress?.() ?? undefined;
    } catch {
      resultado.current = 'mal';
    }
    if (devuelto && typeof devuelto.then === 'function') {
      resultado.current = 'pendiente';
      const cerrar = (como: 'bien' | 'mal') => () => {
        if (!montado.current || pulsacion.current !== turno) return;
        resultado.current = como;
        resolver();
      };
      devuelto.then(cerrar('bien'), cerrar('mal'));
    }

    if (reducida) {
      texto.set(withTiming(0.55, { duration: 150 }));
      luego(200, () => {
        atadoListo.current = true;
        resolver();
      });
      return;
    }

    // El texto se retira y el hilo cruza el botón anudándose.
    texto.set(withTiming(0, { duration: 140 }));
    dibujo.set(0);
    holgura.set(1);
    recorte.set(0);
    desliz.set(0);
    opacidadHilo.set(1);
    dibujo.set(withTiming(1, { duration: 520, easing: Easing.bezier(0.3, 0.1, 0.25, 1) }));
    luego(540, () => {
      atadoListo.current = true;
      resolver();
    });
  };

  // Dos capas de hilo: primero los tramos que pasan por debajo y, encima, los que pasan por encima.
  const dDebajo = useDerivedValue(() => {
    const cola = recorte.value * cabos[0];
    const cabeza = dibujo.value * (ultimo - recorte.value * (ultimo - cabos[1]));
    return tramosVisibles(recorrido, cortes, holgura.value, cola, cabeza, 1);
  });
  const dEncima = useDerivedValue(() => {
    const cola = recorte.value * cabos[0];
    const cabeza = dibujo.value * (ultimo - recorte.value * (ultimo - cabos[1]));
    return tramosVisibles(recorrido, cortes, holgura.value, cola, cabeza, 0);
  });
  const elevacion = useDerivedValue(() => Math.min(Math.max(holgura.value, 0), 1));

  const botonStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sacudida.value }, { scale: 1 - 0.03 * presion.value }],
  }));
  const hiloStyle = useAnimatedStyle(() => ({
    opacity: opacidadHilo.value,
    transform: [{ translateX: desliz.value }],
  }));
  const textoStyle = useAnimatedStyle(() => ({ opacity: texto.value }));

  const conNudo = fase === 'hecho' && !reducida;
  const etiqueta = fase === 'hecho' ? labelHecho : fase === 'error' ? labelError : label;
  const ocupado = fase === 'atando' || fase === 'esperando';

  return (
    <Animated.View style={botonStyle}>
      <Pressable
        onPress={pulsar}
        onPressIn={() => presion.set(withSpring(1, { stiffness: 400, damping: 26, mass: 1 }))}
        onPressOut={() => presion.set(withSpring(0, { stiffness: 260, damping: 18, mass: 1 }))}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={etiqueta}
        accessibilityState={{ busy: ocupado, disabled }}
        aria-busy={ocupado}
        onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
        style={({ pressed }) => [
          styles.boton,
          pressed && fase === 'reposo' && styles.pulsado,
          disabled && styles.desactivado,
        ]}
      >
        <Animated.Text
          accessibilityLiveRegion="polite"
          numberOfLines={1}
          style={[styles.texto, conNudo && styles.textoConNudo, textoStyle]}
        >
          {etiqueta}
        </Animated.Text>
        {/* Medida del texto de confirmación, para colocar el nudo a su lado. */}
        <Text
          style={[styles.texto, styles.medida]}
          numberOfLines={1}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          aria-hidden
          onLayout={(e) => setAnchoHecho(e.nativeEvent.layout.width)}
        >
          {labelHecho}
        </Text>
        {ancho > 0 && !reducida ? (
          <Animated.View style={[StyleSheet.absoluteFill, hiloStyle]} pointerEvents="none">
            <View style={styles.lienzo}>
              <Svg width={ancho} height={ALTO}>
                <HiloFisico d={dDebajo} grosor={grosor} grosorBase={GROSOR} sombra={elevacion} tono="crema" />
                <HiloFisico d={dEncima} grosor={grosor} grosorBase={GROSOR} sombra={elevacion} tono="crema" />
              </Svg>
            </View>
          </Animated.View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const useStyles = crearEstilos((colors) => ({
  boton: {
    height: ALTO,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  pulsado: { backgroundColor: colors.accentDark },
  desactivado: { opacity: 0.5 },
  texto: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.onAccent },
  // Con el nudo a su izquierda, el texto se desplaza para que el conjunto quede centrado.
  textoConNudo: { transform: [{ translateX: (ANCHO_NUDO + SEPARACION) / 2 }] },
  medida: { position: 'absolute', opacity: 0 },
  lienzo: { position: 'absolute', left: 0, top: 0 },
}));
