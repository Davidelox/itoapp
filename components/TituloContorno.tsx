import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/theme';

/** Las 8 direcciones del contorno (como `EmojiIcono`: una sombra sin difuminar por dirección). */
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
const GROSOR = 0.6;

/**
 * Título de cabecera de pestaña: Damion en granate oscuro con un contorno muy fino del granate de la app (`colors.accent`). RN no tiene trazo de texto: se
 * pintan 8 copias debajo, cada una con la sombra de su silueta (radio 0) desplazada en una dirección, y encima el
 * texto limpio. Solo el de encima lo leen los lectores de pantalla.
 * Damion es cursiva: sus trazos sobresalen de la caja y iOS los recorta; el relleno ensancha la caja y el margen negativo
 * mantiene el título alineado a 20 px.
 */
export function TituloContorno({ texto }: { texto: string }) {
  return (
    <View style={styles.caja}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        {DIRECCIONES.map(([dx, dy]) => (
          <Text
            key={`${dx},${dy}`}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={[styles.titulo, styles.copia, { textShadowOffset: { width: dx * GROSOR, height: dy * GROSOR } }]}
          >
            {texto}
          </Text>
        ))}
      </View>
      <Text accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.titulo}>
        {texto}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { flexShrink: 1, marginLeft: -8 },
  titulo: { fontFamily: fonts.brand, fontSize: 34, lineHeight: 46, paddingHorizontal: 8, color: colors.accentDark },
  copia: { position: 'absolute', left: 0, right: 0, top: 0, textShadowColor: colors.accent, textShadowRadius: 0 },
});
