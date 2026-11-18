import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Marcador } from '@/components/calendario/Marcador';
import { colors, fonts } from '@/constants/theme';
import type { MarcadorSpec } from '@/lib/calendario/colores';
import type { PartesLinea } from '@/lib/calendario/semana';

export const ALTO_LINEA = 32;
const TAMANO_MARCADOR = 20;

/**
 * Una línea de la Semana detallada: marcador (que ya lleva el icono de la categoría), hora en negrita y título; en un pago, el
 * importe a la derecha. Lo único que se recorta es el título (con «…»): nunca la hora ni el importe. Es un botón
 * de 32 px con 6 px de margen táctil arriba y abajo (44 px efectivos), y lee su etiqueta entera.
 */
export function LineaSemana({
  partes,
  marcador,
  arriba = false,
  abajo = false,
  onPress,
}: {
  partes: PartesLinea;
  marcador: MarcadorSpec;
  /** Margen táctil de 6 px hacia fuera: solo en la primera línea del día (arriba) y en la última (abajo); en medio, ninguno. */
  arriba?: boolean;
  abajo?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={partes.etiqueta}
      hitSlop={{ top: arriba ? 6 : 0, bottom: abajo ? 6 : 0 }}
      onPress={onPress}
      style={({ pressed }) => [styles.linea, pressed && { opacity: 0.6 }]}
    >
      <View style={styles.marcador}>
        <Marcador marcador={marcador} tamano={TAMANO_MARCADOR} atenuado={partes.tachado} />
      </View>
      {partes.hora ? <Text style={[styles.hora, partes.tachado && styles.tachado]}>{partes.hora}</Text> : null}
      {partes.secreto ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ionicons name="lock-closed" size={11} color={colors.textSecondary} />
        </View>
      ) : null}
      <Text style={[styles.titulo, partes.tachado && styles.tachado]} numberOfLines={1} ellipsizeMode="tail">
        {partes.titulo}
      </Text>
      {partes.derecha ? <Text style={[styles.derecha, partes.tachado && styles.tachado]}>{partes.derecha}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  linea: { height: ALTO_LINEA, flexDirection: 'row', alignItems: 'center', gap: 6 },
  marcador: { width: TAMANO_MARCADOR },
  hora: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, flexShrink: 0 },
  titulo: { flexShrink: 1, flexGrow: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  derecha: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, flexShrink: 0 },
  tachado: { textDecorationLine: 'line-through', opacity: 0.55 },
});
