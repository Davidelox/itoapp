import { View } from 'react-native';

import type { ColorBarra } from '@/lib/calendario/colores';

/**
 * Barra de un evento de varios días: relleno pastel y contorno de 1 px en el tono oscuro de la persona. Si es de
 * los dos, dos mitades (arriba m1 y abajo m2 en horizontal; izquierda m1 y derecha m2 en vertical), cada una con
 * el contorno de su persona por fuera. `inicio` y `fin`: el evento empieza o acaba en este trozo (extremo
 * redondeado y con contorno); donde sigue en otra fila, la barra va abierta. Rellena a su contenedor.
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
  const partes = [
    { relleno: color.relleno, borde: color.borde },
    ...(color.relleno2 && color.borde2 ? [{ relleno: color.relleno2, borde: color.borde2 }] : []),
  ];
  const radio = grosor / 2;
  return (
    <View style={{ flex: 1, flexDirection: vertical ? 'row' : 'column' }}>
      {partes.map((p, i) => {
        const primera = i === 0;
        const ultima = i === partes.length - 1;
        // Lados con contorno: los dos largos (uno por mitad) y los extremos donde el evento empieza o acaba.
        const arriba = vertical ? inicio : primera;
        const abajo = vertical ? fin : ultima;
        const izquierda = vertical ? primera : inicio;
        const derecha = vertical ? ultima : fin;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              backgroundColor: p.relleno,
              borderColor: p.borde,
              borderTopWidth: arriba ? 1 : 0,
              borderBottomWidth: abajo ? 1 : 0,
              borderLeftWidth: izquierda ? 1 : 0,
              borderRightWidth: derecha ? 1 : 0,
              // Una esquina se redondea si sus dos lados llevan contorno.
              borderTopLeftRadius: arriba && izquierda ? radio : 0,
              borderTopRightRadius: arriba && derecha ? radio : 0,
              borderBottomLeftRadius: abajo && izquierda ? radio : 0,
              borderBottomRightRadius: abajo && derecha ? radio : 0,
            }}
          />
        );
      })}
    </View>
  );
}
