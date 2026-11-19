import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';

import type { MarcadorSpec } from '@/lib/calendario/colores';
import { RADIO_CUADRADO } from '@/lib/calendario/disposicion';
import { franjasInsignia } from '@/lib/calendario/rayado';

/** Opacidad de lo atenuado (días de otros meses): con 0,65 el contorno sigue a ≥ 3:1 sobre el gris de fuera de mes. */
export const OPACIDAD_ATENUADO = 0.65;

/**
 * Marcador de un evento, un cumpleaños o un pago (docs/plan-calendario-iconos.md): el glifo dice qué es y el
 * color de quién es. Evento y cumpleaños: insignia circular como un avatar (relleno pastel, contorno de 1 px
 * en el tono oscuro; RAYADA si es de los dos: 4 franjas a 45° que alternan m1, m2, m1, m2, cada una con el
 * contorno de su persona) con el icono de su categoría encima. Pago: cuadrado con monedas amontonadas; si es
 * recurrente, las mismas monedas con una insignia de bucle (círculo con flecha circular) en una esquina. Naranja
 * con monedas blancas si no es de una persona; si es en solitario, pastel de esa persona con contorno y monedas en
 * su tono oscuro. `tamano` es el tamaño EXTERIOR en px. Oculto a los lectores de pantalla: lo que dice está en las
 * etiquetas de las filas.
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
      style={[{ width: tamano, height: tamano }, atenuado && { opacity: OPACIDAD_ATENUADO }]}
    >
      {marcador.forma === 'pago' ? <Pago marcador={marcador} tamano={tamano} /> : <Insignia marcador={marcador} tamano={tamano} />}
    </View>
  );
}

function Insignia({ marcador, tamano }: { marcador: MarcadorSpec; tamano: number }) {
  const c = tamano / 2;
  const r = c - 0.5; // el contorno de 1 px queda dentro del tamaño exterior
  const { relleno, borde, relleno2, borde2 } = marcador;
  const franjas = relleno2 ? franjasInsignia(tamano) : [];
  return (
    <>
      <Svg width={tamano} height={tamano} viewBox={`0 0 ${tamano} ${tamano}`}>
        {relleno2 ? (
          <>
            {/* Fondo de m1 y, encima, las franjas de m2; el contorno va por tramos, en el tono oscuro de cada persona. */}
            <Circle cx={c} cy={c} r={r} fill={relleno} />
            {franjas.map((franja, i) => (franja.color === 1 ? <Path key={`r${i}`} d={franja.area} fill={relleno2} /> : null))}
            {franjas.map((franja, i) =>
              franja.arcos.map((d, j) => (
                <Path key={`${i}-${j}`} d={d} fill="none" stroke={franja.color === 1 ? (borde2 ?? borde) : borde} strokeWidth={1} />
              )),
            )}
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
 * Cuadrado con las monedas amontonadas. Naranja con monedas blancas (borde del mismo naranja), o, en solitario,
 * pastel de la persona con contorno de 1 px y monedas en su tono oscuro. Recurrente: las mismas monedas, un poco
 * subidas a la izquierda, con una insignia de bucle en la esquina de abajo a la derecha: círculo del color de las
 * monedas y flecha circular del color del cuadrado (blanco y naranja; o tono oscuro y pastel). Todo en porcentajes
 * del lado, para que escale con el marcador.
 */
function Pago({ marcador, tamano }: { marcador: MarcadorSpec; tamano: number }) {
  const recurrente = !!marcador.recurrente;
  const lado = Math.round(tamano * 0.46);
  const desplazo = recurrente ? -Math.round(tamano * 0.07) : 0;
  return (
    <View
      style={[
        styles.pago,
        { borderRadius: tamano * RADIO_CUADRADO, backgroundColor: marcador.relleno, borderWidth: 1, borderColor: marcador.borde },
      ]}
    >
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
  // -1: la insignia llega a la esquina exterior del cuadrado, por encima de su contorno de 1 px.
  bucle: { position: 'absolute', right: -1, bottom: -1 },
});
