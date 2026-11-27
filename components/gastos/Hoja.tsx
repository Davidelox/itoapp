import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, radius } from '@/constants/theme';
import { crearEstilos } from '@/lib/tema';

/** Hoja inferior modal (mockups Bote, DetalleGasto): fondo oscurecido que la cierra, asa y título. */
export function Hoja({
  visible,
  titulo,
  onCerrar,
  bloqueada = false,
  desplazable = false,
  alerta = false,
  pie,
  children,
}: {
  visible: boolean;
  titulo: string;
  onCerrar: () => void;
  /** Mientras se guarda no se puede cerrar: cerrar y volver a abrir duplicaría el movimiento (revisión I3). */
  bloqueada?: boolean;
  /** Contenido largo (Saldar): la hoja ocupa hasta el 92 % de la pantalla y su contenido hace scroll. */
  desplazable?: boolean;
  /** Hoja de confirmación (borrar, deshacer): la anuncia como diálogo de alerta. */
  alerta?: boolean;
  /** Fijo abajo, fuera del scroll (el botón principal). */
  pie?: ReactNode;
  children: ReactNode;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const cerrar = () => {
    if (!bloqueada) onCerrar();
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={cerrar}>
      <KeyboardAvoidingView style={styles.fondo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Cerrar" onPress={cerrar} />
        <View
          style={[styles.hoja, desplazable && styles.alta, { paddingBottom: pie ? 0 : insets.bottom + 20 }]}
          accessibilityViewIsModal
          role={alerta ? 'alertdialog' : undefined}
        >
          <View style={styles.asa} />
          <View style={styles.cabecera}>
            <Text accessibilityRole="header" style={styles.titulo}>
              {titulo}
            </Text>
            {desplazable ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={cerrar} style={styles.cerrar}>
                <Text style={styles.cerrarTexto}>✕</Text>
              </Pressable>
            ) : null}
          </View>
          {desplazable ? (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContenido} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
              {children}
            </ScrollView>
          ) : (
            children
          )}
          {pie ? <View style={[styles.pie, { paddingBottom: insets.bottom + 20 }]}>{pie}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = crearEstilos((colors) => ({
  fondo: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.velo },
  hoja: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl + 4,
    borderTopRightRadius: radius.xl + 4,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 14,
  },
  asa: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.inputBorder },
  titulo: { flex: 1, fontFamily: fonts.title, fontSize: 24, color: colors.text },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cerrar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  cerrarTexto: { fontSize: 18, color: colors.textSecondary },
  alta: { maxHeight: '92%' },
  scroll: { flexShrink: 1 },
  scrollContenido: { gap: 10, paddingBottom: 12 },
  pie: { marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 16, gap: 12, borderTopWidth: 1, borderTopColor: colors.border },
}));
