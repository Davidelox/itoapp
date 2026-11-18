import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/constants/theme';
import type { MarcadorSpec } from '@/lib/calendario/colores';

/**
 * Marcador de un evento, un pago o un cumpleaños (docs/plan-calendario-v2.md §2.2): la forma dice qué es y
 * el color de quién es. `tamano` es el tamaño EXTERIOR en px (el anillo del cumpleaños va incluido: 12 px
 * son 7 px de relleno fucsia, 1 px en blanco y 1,5 px de anillo). Oculto a los lectores de pantalla: lo que
 * dice está en las etiquetas de las filas.
 */
export function Marcador({ marcador, tamano = 6, atenuado = false }: { marcador: MarcadorSpec; tamano?: number; atenuado?: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={atenuado ? { opacity: 0.55 } : undefined}
    >
      {marcador.forma === 'anillo' ? <Anillo marcador={marcador} tamano={tamano} /> : <Figura marcador={marcador} tamano={tamano} />}
    </View>
  );
}

function Figura({ marcador, tamano }: { marcador: MarcadorSpec; tamano: number }) {
  return (
    <Svg width={tamano} height={tamano} viewBox="0 0 10 10">
      {marcador.forma === 'cuadrado' ? (
        <Rect x={0.5} y={0.5} width={9} height={9} rx={2} fill={marcador.relleno} />
      ) : marcador.forma === 'mitades' ? (
        <>
          <Path d="M5 0 A5 5 0 0 0 5 10 Z" fill={marcador.relleno} />
          <Path d="M5 0 A5 5 0 0 1 5 10 Z" fill={marcador.relleno2 ?? marcador.relleno} />
        </>
      ) : (
        <Circle cx={5} cy={5} r={5} fill={marcador.relleno} />
      )}
    </Svg>
  );
}

/** Círculo fucsia con un anillo del color de la persona (mitad y mitad si es de los dos), separado por 1 px en blanco. */
function Anillo({ marcador, tamano }: { marcador: MarcadorSpec; tamano: number }) {
  const ancho = 1.5;
  const radio = 6 - ancho / 2;
  return (
    <Svg width={tamano} height={tamano} viewBox="0 0 12 12">
      {marcador.anillo2 ? (
        <>
          <Path d={`M6 ${6 - radio} A${radio} ${radio} 0 0 0 6 ${6 + radio}`} fill="none" stroke={marcador.anillo} strokeWidth={ancho} />
          <Path d={`M6 ${6 - radio} A${radio} ${radio} 0 0 1 6 ${6 + radio}`} fill="none" stroke={marcador.anillo2} strokeWidth={ancho} />
        </>
      ) : (
        <Circle cx={6} cy={6} r={radio} fill="none" stroke={marcador.anillo ?? colors.text} strokeWidth={ancho} />
      )}
      <Circle cx={6} cy={6} r={3.5} fill={marcador.relleno} />
    </Svg>
  );
}
