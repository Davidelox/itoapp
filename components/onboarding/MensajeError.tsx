import { useEffect } from 'react';
import { AccessibilityInfo, Platform, Text } from 'react-native';

import { fonts, fontSizes } from '@/constants/theme';
import { crearEstilos } from '@/lib/tema';

/** Error bajo el campo afectado: se anuncia al lector de pantalla al aparecer o cambiar. */
export function MensajeError({ texto }: { texto?: string | null }) {
  const styles = useStyles();
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

const useStyles = crearEstilos((colors) => ({
  texto: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.small, lineHeight: 20, color: colors.error },
}));
