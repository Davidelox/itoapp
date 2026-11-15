import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BotonPrincipal, EnlaceTexto } from '@/components/onboarding/Botones';
import { colors, fonts, spacing } from '@/constants/theme';
import { cerrarSesion } from '@/lib/auth/acciones';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/** Hay sesión pero no se ha podido leer el espacio y no hay caché de la fase. */
export default function SinConexion() {
  const insets = useSafeAreaInsets();
  const { refrescar } = useEstado();
  const [cargando, setCargando] = useState(false);

  const reintentar = async () => {
    setCargando(true);
    await refrescar();
    setCargando(false);
  };

  return (
    <View style={[styles.pantalla, { paddingTop: insets.top + 56, paddingBottom: Math.max(insets.bottom, spacing.xl) }]}>
      <View style={styles.centro}>
        <Text accessibilityRole="header" style={styles.titulo}>
          No hay conexión
        </Text>
        <Text style={styles.texto}>Necesitamos conexión para preparar tu espacio la primera vez.</Text>
      </View>
      <BotonPrincipal etiqueta="Reintentar" etiquetaCargando="Comprobando…" cargando={cargando} onPress={reintentar} />
      <EnlaceTexto etiqueta="Cerrar sesión" onPress={() => cerrarSesion()} />
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl, gap: spacing.sm },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  titulo: { fontFamily: fonts.title, fontSize: 28, color: colors.text, textAlign: 'center' },
  texto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary, textAlign: 'center', maxWidth: 300 },
});
