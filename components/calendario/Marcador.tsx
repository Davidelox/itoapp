import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';

import type { MarcadorSpec } from '@/lib/calendario/colores';
import { RADIO_CUADRADO } from '@/lib/calendario/disposicion';

/**
 * Marcador de un evento, un cumpleaños o un pago (docs/plan-calendario-iconos.md): el glifo dice qué es y el
 * color de quién es. Evento y cumpleaños: insignia circular como un avatar (relleno pastel, contorno de 1 px
 * en el tono oscuro, partida en dos mitades si es de los dos) con el icono de su categoría encima. Pago:
 * cuadrado naranja con monedas amontonadas blancas; si es recurrente, las mismas monedas con una insignia de bucle
 * (círculo con flecha circular) en una esquina. `tamano` es el tamaño EXTERIOR en px. Oculto a los lectores de
 * pantalla: lo que dice está en las etiquetas de las filas.
 */
export function Marcador({
  marcador,
  tamano = 18,
  atenuado = false,
}: {
  marcador: MarcadorSpec;
  tamano?: number;
  atenuado?: boolean;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[{ width: tamano, height: tamano }, atenuado && { opacity: 0.55 }]}
    >
      {marcador.forma === 'pago' ? <Pago marcador={marcador} tamano={tamano} /> : <Insignia marcador={marcador} tamano={tamano} />}
    </View>
  );
}

function Insignia({ marcador, tamano }: { marcador: MarcadorSpec; tamano: number }) {
  const c = tamano / 2;
  const r = c - 0.5; // el contorno de 1 px queda dentro del tamaño exterior
  const { relleno, borde, relleno2, borde2 } = marcador;
  const mitad = (barrido: 0 | 1) => `M${c} ${c - r} A${r} ${r} 0 0 ${barrido} ${c} ${c + r}`;
  return (
    <>
      <Svg width={tamano} height={tamano} viewBox={`0 0 ${tamano} ${tamano}`}>
        {relleno2 ? (
          <>
            <Path d={`${mitad(0)} Z`} fill={relleno} />
            <Path d={`${mitad(1)} Z`} fill={relleno2} />
            <Path d={mitad(0)} fill="none" stroke={borde} strokeWidth={1} />
            <Path d={mitad(1)} fill="none" stroke={borde2 ?? borde} strokeWidth={1} />
          </>
        ) : (
          <Circle cx={c} cy={c} r={r} fill={relleno} stroke={borde} strokeWidth={1} />
        )}
      </Svg>
      <View style={styles.centro}>
        <Ionicons name={marcador.icono ?? 'calendar'} size={Math.round(tamano * 0.62)} color={marcador.tinta} />
      </View>
    </>
  );
}

/** Punto del círculo de la insignia (viewBox 24×24, ángulo en grados, creciente en sentido horario en pantalla). */
const punto = (r: number, grados: number) => {
  const a = (grados * Math.PI) / 180;
  return { x: 12 + r * Math.cos(a), y: 12 + r * Math.sin(a) };
};

/**
 * Insignia de bucle de un pago recurrente: círculo blanco con un arco naranja en sentido horario que acaba en
 * punta de flecha. Hasta 14 px de marcador (insignia de ~6 px) la punta no se lee: queda un arco grueso abierto.
 */
function InsigniaBucle({ lado, pequeno, color, fondo }: { lado: number; pequeno: boolean; color: string; fondo: string }) {
  const r = 6.4;
  const ini = punto(r, -60);
  const fin = punto(r, 220);
  const trazo = pequeno ? 4 : 2.8;
  // Punta de flecha al final del arco: apunta en la tangente horaria (-sen, cos); la normal es (cos, sen).
  const a = (220 * Math.PI) / 180;
  const tx = -Math.sin(a);
  const ty = Math.cos(a);
  const nx = Math.cos(a);
  const ny = Math.sin(a);
  const cola = 3.4;
  const punta = `${fin.x + tx * 3.6},${fin.y + ty * 3.6} ${fin.x + nx * cola},${fin.y + ny * cola} ${fin.x - nx * cola},${fin.y - ny * cola}`;
  return (
    <Svg width={lado} height={lado} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={12} fill={fondo} />
      <Path d={`M${ini.x} ${ini.y} A${r} ${r} 0 1 1 ${fin.x} ${fin.y}`} fill="none" stroke={color} strokeWidth={trazo} strokeLinecap="round" />
      {pequeno ? null : <Polygon points={punta} fill={color} />}
    </Svg>
  );
}

/**
 * Cuadrado naranja con las monedas amontonadas en blanco. Recurrente: las mismas monedas, un poco subidas a la
 * izquierda, con una insignia de bucle (círculo blanco con flecha circular naranja) en la esquina de abajo a la
 * derecha. Todo en porcentajes del lado, para que escale con el marcador.
 */
function Pago({ marcador, tamano }: { marcador: MarcadorSpec; tamano: number }) {
  const recurrente = !!marcador.recurrente;
  const lado = Math.round(tamano * 0.46);
  const desplazo = recurrente ? -Math.round(tamano * 0.07) : 0;
  return (
    <View style={[styles.pago, { borderRadius: tamano * RADIO_CUADRADO, backgroundColor: marcador.relleno }]}>
      <View style={{ transform: [{ translateX: desplazo }, { translateY: desplazo }] }}>
        <FontAwesome5 name="coins" solid size={Math.round(tamano * (recurrente ? 0.56 : 0.6))} color={marcador.tinta} />
      </View>
      {recurrente ? (
        <View style={[styles.bucle, { width: lado, height: lado }]}>
          <InsigniaBucle lado={lado} pequeno={tamano <= 14} color={marcador.relleno} fondo={marcador.tinta} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centro: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  pago: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bucle: { position: 'absolute', right: 0, bottom: 0 },
});
