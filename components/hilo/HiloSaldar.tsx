import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg from 'react-native-svg';

import { type ColorPersona, colors, fonts, personColors } from '@/constants/theme';
import { type Pareja, useEstado } from '@/lib/pareja/EstadoProvider';
import {
  TRAZO_VACIO,
  type Punto,
  type Recorrido,
  curvasPorPuntos,
  muestrearRecorrido,
  trazoEntre,
} from './geometria';
import { hapticaExito } from './haptics';
import { HiloFisico } from './HiloFisico';
import { NUDO_FLOJO, cortesDelNudo, tramosVisibles } from './nudo';

const ANCHO_MAXIMO = 320;
const ALTO = 130;
const AVATAR = 56;
const MARGEN = 8;
/** Altura a la que el hilo sale de los avatares (su centro). */
const Y_HILO = 24 + AVATAR / 2;
const GROSOR = 2.6;

/** Tiempos del desanudado (ms). */
const T_AQUIETAR = 140; // el balanceo se detiene
const T_AFLOJAR = 320; // el nudo se abre
const T_DESHACER = 480; // los cabos pasan uno a través del otro
const T_TENSAR = T_AQUIETAR + T_AFLOJAR + T_DESHACER;

const MUELLE_TENSAR = { stiffness: 210, damping: 11, mass: 1 };
const MUELLE_ANUDAR = { stiffness: 230, damping: 14, mass: 1 };
const MUELLE_TIRON = { stiffness: 220, damping: 10, mass: 1 };

/*
 * El hilo entre los dos avatares pasa por cuatro formas, todas con los mismos puntos:
 *   0 · anudado: cuelga con holgura y el nudo, apretado, pesa en el centro
 *   1 · flojo: el nudo se ha abierto
 *   2 · suelto: los cabos se han cruzado y ya no hay nudo, solo una onda
 *   3 · tenso: una línea limpia que sigue uniendo a los dos
 * `fase` recorre esos números y el hilo se interpola entre las dos formas vecinas.
 */
function formasDelHilo(ancho: number) {
  const x1 = MARGEN + AVATAR - 6; // los extremos quedan bajo el borde de cada avatar
  const x2 = ancho - MARGEN - AVATAR + 6;
  const cx = ancho / 2;
  const vano = x2 - x1;
  const nudos = NUDO_FLOJO.length;

  /** Hilo colgante con el nudo en el centro: `caida` del centro, tamaño del nudo y desvío lateral. */
  const colgante = (caida: number, escala: number, desvio: number): Punto[] => [
    [x1, Y_HILO],
    [x1 + vano * 0.22 + desvio * 0.5, Y_HILO + caida * 0.62],
    ...NUDO_FLOJO.map((p): Punto => [cx + desvio + p[0] * escala, Y_HILO + caida + p[1] * escala]),
    [x2 - vano * 0.22 + desvio * 0.5, Y_HILO + caida * 0.62],
    [x2, Y_HILO],
  ];
  /** Hilo sin nudo: los puntos del nudo repartidos a lo largo de una onda (o de una recta si `onda` es 0). */
  const sinNudo = (caida: number, onda: number): Punto[] => {
    const tramo = Math.min(84, vano * 0.5);
    return [
      [x1, Y_HILO],
      [x1 + vano * 0.22, Y_HILO + caida * 0.7],
      ...NUDO_FLOJO.map((_, j): Punto => {
        const s = j / (nudos - 1);
        return [
          cx + (s - 0.5) * tramo,
          Y_HILO + caida + onda * Math.sin(Math.PI * s) * Math.sin(s * Math.PI * 3),
        ];
      }),
      [x2 - vano * 0.22, Y_HILO + caida * 0.7],
      [x2, Y_HILO],
    ];
  };

  const flojo = curvasPorPuntos(colgante(27, 1.2, 0));
  // Todas las formas se muestrean en los mismos puntos del hilo flojo, que es el más largo.
  const muestra = (forma: Punto[]) => muestrearRecorrido(flojo, curvasPorPuntos(forma), 2);
  const anudado = muestra(colgante(21, 0.5, 0));
  const ladeado = muestra(colgante(20, 0.5, 9));
  const suelto = muestra(sinNudo(13, 7));
  const tenso = muestra(sinNudo(0, 0));

  const entre = (a: { x: number[]; y: number[] }, b: { x: number[]; y: number[] }): Recorrido => ({
    tx: a.x,
    ty: a.y,
    lx: b.x,
    ly: b.y,
    paso: anudado.paso,
    longitud: anudado.longitud,
    marcas: anudado.marcas,
  });
  const de = (r: Recorrido) => ({ x: r.lx, y: r.ly });
  const formaFloja = { x: anudado.tx, y: anudado.ty };
  const ultimo = anudado.tx.length - 1;
  return {
    ultimo,
    cortes: cortesDelNudo(anudado.marcas, 2, ultimo),
    balanceo: entre(de(anudado), de(ladeado)),
    aflojar: entre(de(anudado), formaFloja),
    deshacer: entre(formaFloja, de(suelto)),
    tensar: entre(de(suelto), de(tenso)),
  };
}

/** Colores e inicial de quien ocupa un hueco de la pareja; los de reserva si falta la persona o su color. */
function personaDeHueco(pareja: Pareja | null, slot: 'm1' | 'm2', reserva: ColorPersona, letra: string) {
  const miembro = [pareja?.yo, pareja?.otra].find((m) => m?.slot === slot);
  const paleta = personColors[miembro?.color ?? reserva];
  return { bg: paleta.bg, ink: paleta.ink, letra: miembro?.nombre.trim().charAt(0).toUpperCase() || letra };
}

export type HiloSaldarHandle = { desatar: () => void; reiniciar: () => void };

type Props = {
  /** Si se pasa, controla el estado; si no, se controla con el handle (desatar/reiniciar). */
  saldado?: boolean;
  ref?: Ref<HiloSaldarHandle>;
};

/**
 * El hilo que une a los dos: cuelga entre sus avatares con un nudo, la deuda, que pesa y se balancea.
 * Al saldar, el nudo se afloja, los cabos pasan uno a través del otro y el hilo se tensa: siguen
 * unidos, pero sin nudo. Al reiniciar se vuelve a anudar.
 * Con «Reducir movimiento» el cambio es directo, con un fundido del mensaje.
 */
export function HiloSaldar({ saldado, ref }: Props) {
  const reducida = useReducedMotion();
  // Colores e iniciales reales de la pareja (m1 a la izquierda, m2 a la derecha); Menta/Lavanda si aún no hay.
  const { pareja } = useEstado();
  const izquierda = personaDeHueco(pareja, 'm1', 'menta', 'D');
  const derecha = personaDeHueco(pareja, 'm2', 'lavanda', 'M');
  const [interno, setInterno] = useState(false);
  const activo = saldado ?? interno;
  const [ancho, setAncho] = useState(280);
  const primera = useRef(true);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => ({
    desatar: () => setInterno(true),
    reiniciar: () => setInterno(false),
  }));

  const formas = useMemo(() => formasDelHilo(ancho), [ancho]);
  const { ultimo, cortes, balanceo, aflojar, deshacer, tensar } = formas;

  /** 0 = anudado, 1 = flojo, 2 = suelto, 3 = tenso (ver formasDelHilo). */
  const fase = useSharedValue(activo ? 3 : 0);
  /** Balanceo del hilo anudado, de -1 a 1. */
  const vaiven = useSharedValue(0);
  /** Tirón que acusan los avatares cuando el hilo se tensa o se anuda. */
  const tiron = useSharedValue(0);
  const mensaje = useSharedValue(activo ? 1 : 0);
  const grosor = useSharedValue(GROSOR);

  useEffect(() => {
    const esPrimera = primera.current;
    primera.current = false;
    if (temporizador.current) clearTimeout(temporizador.current);
    cancelAnimation(vaiven);
    cancelAnimation(tiron);

    const balancear = (retraso: number) => {
      vaiven.value = withDelay(
        retraso,
        withSequence(
          withTiming(0.55, { duration: 1100, easing: Easing.out(Easing.sin) }),
          withRepeat(withTiming(-0.55, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true),
        ),
      );
    };

    if (reducida || esPrimera) {
      // Sin transición: al montar, o con movimiento reducido (solo se funde el mensaje).
      fase.value = activo ? 3 : 0;
      tiron.value = 0;
      vaiven.value = 0;
      mensaje.value = esPrimera ? (activo ? 1 : 0) : withTiming(activo ? 1 : 0, { duration: 220 });
      if (activo && !esPrimera) {
        hapticaExito();
        anunciar();
      }
      if (!activo && !reducida) balancear(300);
      return;
    }

    // Se parte de donde esté el hilo, así que pulsar varias veces seguidas no lo descoloca.
    const desde = fase.value;
    if (activo) {
      vaiven.value = withTiming(0, { duration: T_AQUIETAR });
      const pasos: number[] = [];
      if (desde < 1) pasos.push(withTiming(1, { duration: T_AFLOJAR, easing: Easing.out(Easing.cubic) }));
      if (desde < 2) pasos.push(withTiming(2, { duration: T_DESHACER, easing: Easing.inOut(Easing.cubic) }));
      pasos.push(withSpring(3, MUELLE_TENSAR));
      const espera = desde < 1 ? T_TENSAR : desde < 2 ? T_AQUIETAR + T_DESHACER : T_AQUIETAR;
      fase.value = withDelay(T_AQUIETAR, withSequence(...pasos));
      // El tirón llega cuando el hilo se tensa: lo notan los avatares, la mano y el mensaje.
      tiron.value = withDelay(espera + 60, withSequence(withTiming(1, { duration: 90 }), withSpring(0, MUELLE_TIRON)));
      mensaje.value = withDelay(espera + 120, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
      temporizador.current = setTimeout(() => {
        hapticaExito();
        anunciar();
      }, espera + 80);
    } else {
      mensaje.value = withTiming(0, { duration: 180 });
      const pasos: number[] = [];
      if (desde > 2) pasos.push(withTiming(2, { duration: 300, easing: Easing.out(Easing.cubic) }));
      if (desde > 1) pasos.push(withTiming(1, { duration: T_DESHACER, easing: Easing.inOut(Easing.cubic) }));
      pasos.push(withSpring(0, MUELLE_ANUDAR));
      const espera = desde > 2 ? 300 + T_DESHACER : desde > 1 ? T_DESHACER : 0;
      fase.value = withSequence(...pasos);
      // Al apretarse el nudo vuelve su peso: un tirón más leve, y el hilo retoma el balanceo.
      tiron.value = withDelay(espera + 60, withSequence(withTiming(0.5, { duration: 90 }), withSpring(0, MUELLE_TIRON)));
      balancear(espera + 500);
    }
  }, [activo, reducida, fase, vaiven, tiron, mensaje]);

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  // Dos capas, como en el nudo del botón: primero los tramos que pasan por debajo y, encima, el resto.
  const dDebajo = useDerivedValue(() => {
    const f = fase.value;
    if (Math.abs(f) < 0.001) return tramosVisibles(balanceo, cortes, vaiven.value, 0, ultimo, 1);
    if (f < 1) return tramosVisibles(aflojar, cortes, f, 0, ultimo, 1);
    if (f < 2) return tramosVisibles(deshacer, cortes, f - 1, 0, ultimo, 1);
    // Sin nudo ya no hay cruces: el hilo se dibuja de una pieza, sin uniones entre tramos.
    return trazoEntre(tensar, f - 2, 0, ultimo);
  });
  const dEncima = useDerivedValue(() => {
    const f = fase.value;
    if (Math.abs(f) < 0.001) return tramosVisibles(balanceo, cortes, vaiven.value, 0, ultimo, 0);
    if (f < 1) return tramosVisibles(aflojar, cortes, f, 0, ultimo, 0);
    if (f < 2) return tramosVisibles(deshacer, cortes, f - 1, 0, ultimo, 0);
    return TRAZO_VACIO;
  });
  /** El hilo colgante está separado del papel; tenso, queda apoyado. */
  const elevacion = useDerivedValue(() => Math.min(Math.max(1 - (fase.value - 2), 0), 1));

  const izqStyle = useAnimatedStyle(() => ({ transform: [{ translateX: 3 * tiron.value }] }));
  const derStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -3 * tiron.value }] }));
  const mensajeStyle = useAnimatedStyle(() => ({
    opacity: mensaje.value,
    transform: [{ translateY: (1 - mensaje.value) * 6 }],
  }));

  return (
    <View
      style={styles.contenedor}
      accessible
      accessibilityLabel={activo ? 'Cuentas a cero' : 'Cuentas pendientes de saldar'}
      onLayout={(e) => setAncho(Math.max(200, Math.min(ANCHO_MAXIMO, Math.round(e.nativeEvent.layout.width))))}
    >
      <View style={[styles.escena, { width: ancho }]}>
        <Svg width={ancho} height={ALTO} style={StyleSheet.absoluteFill} pointerEvents="none">
          <HiloFisico d={dDebajo} grosor={grosor} grosorBase={GROSOR} sombra={elevacion} />
          <HiloFisico d={dEncima} grosor={grosor} grosorBase={GROSOR} sombra={elevacion} />
        </Svg>
        <Animated.View style={[styles.avatar, { left: MARGEN, backgroundColor: izquierda.bg }, izqStyle]}>
          <Text style={[styles.letra, { color: izquierda.ink }]}>{izquierda.letra}</Text>
        </Animated.View>
        <Animated.View style={[styles.avatar, { right: MARGEN, backgroundColor: derecha.bg }, derStyle]}>
          <Text style={[styles.letra, { color: derecha.ink }]}>{derecha.letra}</Text>
        </Animated.View>
      </View>
      <Animated.Text style={[styles.mensaje, mensajeStyle]}>¡Cuentas a cero!</Animated.Text>
      {/* Región viva, solo para lectores de pantalla: anuncia el cambio en Android y web. */}
      <Text accessibilityLiveRegion="polite" style={styles.soloLector}>
        {activo ? 'Cuentas a cero' : ''}
      </Text>
    </View>
  );
}

function anunciar() {
  // En Android y web lo anuncia la región viva del mensaje; en iOS hay que pedirlo.
  if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility('Cuentas a cero');
}

const styles = StyleSheet.create({
  contenedor: { alignItems: 'center', alignSelf: 'stretch' },
  escena: { height: ALTO },
  avatar: {
    position: 'absolute',
    top: 24,
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letra: { fontFamily: fonts.titleBold, fontSize: 24 },
  soloLector: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
  mensaje: { fontFamily: fonts.title, fontSize: 22, color: colors.accent, marginTop: 4, minHeight: 30 },
});
