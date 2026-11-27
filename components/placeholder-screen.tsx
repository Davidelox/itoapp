import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { CabeceraPestana, useScrollCabecera } from '@/components/CabeceraPestana';
import { fonts, fontSizes, spacing } from '@/constants/theme';
import { crearEstilos } from '@/lib/tema';

/**
 * Pantalla de pestaña con cabecera fija (`CabeceraPestana`) y contenido con scroll. `proximamente`: pinta «Próximamente»
 * encima del contenido (por defecto sí; Inicio, que ya tiene tarjetas, lo apaga).
 */
export function PlaceholderScreen({
  title,
  accion,
  proximamente = true,
  children,
}: {
  title: string;
  accion?: ReactNode;
  proximamente?: boolean;
  children?: ReactNode;
}) {
  const styles = useStyles();
  const { onScroll, sombra } = useScrollCabecera();
  return (
    <View style={styles.container}>
      <CabeceraPestana titulo={title} accion={accion} sombra={sombra} />
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={styles.contenido}>
        {proximamente ? <Text style={styles.soon}>Próximamente</Text> : null}
        {children}
      </Animated.ScrollView>
    </View>
  );
}

const useStyles = crearEstilos((colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  contenido: { paddingHorizontal: 20, paddingTop: spacing.sm, paddingBottom: 100 },
  soon: { fontFamily: fonts.body, fontSize: fontSizes.body, color: colors.textSecondary },
}));
