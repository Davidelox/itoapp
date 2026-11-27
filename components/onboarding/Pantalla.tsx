import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IndicadorPaso } from '@/components/onboarding/IndicadorPaso';
import { fonts, fontSizes, spacing } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';

type Props = {
  titulo?: string;
  subtitulo?: string;
  /** Botón de atrás de 44 px en la cabecera. */
  onAtras?: () => void;
  paso?: number;
  /** Contenido fijo abajo (botón principal), sobre un pie blanco con borde superior. */
  pie?: ReactNode;
  /** Centra el contenido verticalmente (Bienvenida). */
  centrado?: boolean;
  children: ReactNode;
};

/** Estructura común de las pantallas de cuenta y de primer uso: cabecera, contenido con scroll y pie fijo. */
export function Pantalla({ titulo, subtitulo, onAtras, paso, pie, children }: Props) {
  const colors = useColores();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={styles.raiz}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.contenido, { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xl }]}
      >
        {(onAtras || paso) && (
          <View style={styles.cabecera}>
            {onAtras ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Atrás" onPress={onAtras} style={styles.atras}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </Pressable>
            ) : null}
            {paso ? <IndicadorPaso paso={paso} /> : null}
          </View>
        )}
        {titulo ? (
          <View style={styles.textos}>
            <Text accessibilityRole="header" style={styles.titulo}>
              {titulo}
            </Text>
            {subtitulo ? <Text style={styles.subtitulo}>{subtitulo}</Text> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
      {pie ? <View style={[styles.pie, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>{pie}</View> : null}
    </KeyboardAvoidingView>
  );
}

const useStyles = crearEstilos((colors) => ({
  raiz: { flex: 1, backgroundColor: colors.background },
  contenido: { flexGrow: 1, paddingHorizontal: spacing.xl, gap: spacing.xl },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  atras: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textos: { gap: 6, marginTop: spacing.sm },
  titulo: { fontFamily: fonts.title, fontSize: fontSizes.title, letterSpacing: -0.3, color: colors.text },
  subtitulo: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary },
  pie: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
}));
