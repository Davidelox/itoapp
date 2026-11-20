import { StyleSheet, Text, View } from 'react-native';

/**
 * Emoji centrado en su hueco. En RN el emoji en un `Text` queda descentrado por el `lineHeight` y las métricas de la fuente
 * (y por `includeFontPadding` en Android): se le da una caja cuadrada, `lineHeight` ajustado y se centra por los dos ejes.
 * `size` es el tamaño del emoji; la caja mide un poco más para que no se recorte.
 */
export function EmojiIcono({
  emoji,
  size,
  contorno = false,
  desplazarX = 0,
}: {
  emoji: string;
  size: number;
  contorno?: boolean;
  /** Ajuste fino horizontal, como fracción de `size` (negativo = a la izquierda). Solo para los pines del mapa: allí el marcador se
   *  convierte en imagen y el emoji se veía corrido a la derecha, y en las demás pantallas está centrado. */
  desplazarX?: number;
}) {
  const caja = Math.ceil(size * 1.3);
  const grosor = Math.max(0.75, size * 0.05); // grosor del contorno (px): ~0,8 en un pin de 32
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.caja, { width: caja, height: caja }, desplazarX ? { transform: [{ translateX: size * desplazarX }] } : null]}
    >
      {/* Contorno blanco fino y parejo: 8 copias debajo, cada una con la sombra blanca de su silueta (sin difuminar) desplazada
          en una dirección distinta; la unión de las 8 sombras rodea el glifo por igual por todos los lados. La de encima queda
          limpia. Con una sola sombra difuminada el borde salía irregular (más marcado en unos lados que en otros). */}
      {contorno
        ? DIRECCIONES.map(([dx, dy]) => (
            <Text
              key={`${dx},${dy}`}
              allowFontScaling={false}
              style={[
                styles.emoji,
                {
                  position: 'absolute',
                  width: caja,
                  height: caja,
                  fontSize: size,
                  lineHeight: caja,
                  textShadowColor: '#FFFFFF',
                  textShadowRadius: 0,
                  textShadowOffset: { width: dx * grosor, height: dy * grosor },
                },
              ]}
            >
              {emoji}
            </Text>
          ))
        : null}
      {/* Ancho explícito (la caja entera) y no «lo que mida el texto»: el glifo del emoji se dibuja un poco más ancho que lo que
          mide RN, y con un `Text` ajustado a su contenido el glifo se salía por la derecha y se veía desplazado. */}
      <Text
        allowFontScaling={false}
        style={[styles.emoji, { width: caja, height: caja, fontSize: size, lineHeight: caja }]}
      >
        {emoji}
      </Text>
    </View>
  );
}

/** Las 8 direcciones del contorno (unitarias en cada eje: las diagonales quedan un poco más lejos, que compensa la curvatura). */
const DIRECCIONES: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
];

const styles = StyleSheet.create({
  caja: { alignItems: 'center', justifyContent: 'center' },
  emoji: { textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false, letterSpacing: 0 },
});
