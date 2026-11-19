import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';

import type { ColorBarra } from '@/lib/calendario/colores';
import { rayadoCinta } from '@/lib/calendario/rayado';

/**
 * Barra de un evento de varios días: relleno pastel y contorno de 1 px en el tono oscuro de la persona. Si es de
 * los dos, RAYADA: franjas pequeñas a 45° que se repiten a lo largo de la barra alternando m1, m2, m1, m2…
 * (cada una mide de largo lo que la barra de grueso y empieza por m1), con el contorno de los lados largos por
 * tramos, en el tono oscuro de cada persona. `inicio` y `fin`: el evento empieza o acaba en este trozo (extremo
 * redondeado y con contorno, del color de la franja que lo toca); donde sigue en otra fila, la barra va abierta.
 * Rellena a su contenedor.
 */
export function Cinta({
  color,
  grosor,
  vertical = false,
  inicio,
  fin,
}: {
  color: ColorBarra;
  grosor: number;
  vertical?: boolean;
  inicio: boolean;
  fin: boolean;
}) {
  const [largo, setLargo] = useState(0);
  const radio = grosor / 2;

  if (color.relleno2 && color.borde2) {
    const bordes = [color.borde, color.borde2];
    const rellenos = [color.relleno, color.relleno2];
    const r = largo > 0 ? rayadoCinta(largo, grosor) : null;
    // Los extremos con contorno: el borde de la franja que los toca (hasta medir, el de m1).
    const colorIni = bordes[r?.colorIni ?? 0];
    const colorFin = bordes[r?.colorFin ?? 0];
    // Eje largo → x (horizontal) o y (vertical): se traspone al pintar.
    const p = (x: number, y: number) => (vertical ? { x: y, y: x } : { x, y });
    const caja = vertical ? { w: grosor, h: largo } : { w: largo, h: grosor };
    return (
      <View
        onLayout={(e) => setLargo(Math.round(vertical ? e.nativeEvent.layout.height : e.nativeEvent.layout.width))}
        style={[
          { flex: 1, overflow: 'hidden', backgroundColor: color.relleno },
          vertical
            ? {
                borderTopWidth: inicio ? 1 : 0,
                borderTopColor: colorIni,
                borderBottomWidth: fin ? 1 : 0,
                borderBottomColor: colorFin,
                borderTopLeftRadius: inicio ? radio : 0,
                borderTopRightRadius: inicio ? radio : 0,
                borderBottomLeftRadius: fin ? radio : 0,
                borderBottomRightRadius: fin ? radio : 0,
              }
            : {
                borderLeftWidth: inicio ? 1 : 0,
                borderLeftColor: colorIni,
                borderRightWidth: fin ? 1 : 0,
                borderRightColor: colorFin,
                borderTopLeftRadius: inicio ? radio : 0,
                borderBottomLeftRadius: inicio ? radio : 0,
                borderTopRightRadius: fin ? radio : 0,
                borderBottomRightRadius: fin ? radio : 0,
              },
        ]}
      >
        {r ? (
          <Svg
            style={StyleSheet.absoluteFill}
            width="100%"
            height="100%"
            viewBox={`0 0 ${caja.w} ${caja.h}`}
            preserveAspectRatio="none"
          >
            {r.franjas.map((fr, i) =>
              fr.color === 1 ? (
                <Polygon
                  key={`p${i}`}
                  points={fr.puntos
                    .map(([x, y]) => p(x, y))
                    .map((q) => `${q.x},${q.y}`)
                    .join(' ')}
                  fill={rellenos[1]}
                />
              ) : null,
            )}
            {r.franjas.map((fr, i) =>
              fr.lados.map((lado, j) => {
                if (lado.length < 2) return null;
                const a = p(lado[0][0], lado[0][1]);
                const b = p(lado[1][0], lado[1][1]);
                return <Line key={`${i}-${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={bordes[fr.color]} strokeWidth={1} />;
              }),
            )}
          </Svg>
        ) : null}
      </View>
    );
  }

  // De una sola persona: una pieza con su relleno y su contorno.
  const t = vertical ? inicio : true;
  const b = vertical ? fin : true;
  const izquierda = vertical ? true : inicio;
  const derecha = vertical ? true : fin;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: color.relleno,
        borderColor: color.borde,
        borderTopWidth: t ? 1 : 0,
        borderBottomWidth: b ? 1 : 0,
        borderLeftWidth: izquierda ? 1 : 0,
        borderRightWidth: derecha ? 1 : 0,
        // Una esquina se redondea si sus dos lados llevan contorno.
        borderTopLeftRadius: t && izquierda ? radio : 0,
        borderTopRightRadius: t && derecha ? radio : 0,
        borderBottomLeftRadius: b && izquierda ? radio : 0,
        borderBottomRightRadius: b && derecha ? radio : 0,
      }}
    />
  );
}
