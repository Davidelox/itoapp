import { useEffect } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text } from 'react-native';

import { colors, fonts, fontSizes } from '@/constants/theme';

/** Error bajo el campo afectado: se anuncia al lector de pantalla al aparecer o cambiar. */
export function MensajeError({ texto }: { texto?: string | null }) {
  useEffect(() => {
    if (texto && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(texto);
  }, [texto]);
  if (!texto) return null;
  return (
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.texto}>
      {texto}
    </Text>
  );
}

const styles = StyleSheet.create({
  texto: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.small, lineHeight: 20, color: colors.accent },
});
