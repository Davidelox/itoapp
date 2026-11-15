import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { cerrarSesion } from '@/lib/auth/acciones';
import { useEstado } from '@/lib/pareja/EstadoProvider';

export default function Screen() {
  const router = useRouter();
  const { pareja } = useEstado();
  return (
    <PlaceholderScreen title="Inicio">
      {pareja && pareja.otra === null ? (
        <View style={styles.aviso}>
          <Text style={styles.avisoTitulo}>Tu pareja aún no se ha unido</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/pareja/invitar')}
            style={styles.avisoBoton}
          >
            <Text style={styles.avisoEnlace}>Ver código</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/laboratorio')}
        style={({ pressed }) => [styles.boton, pressed && styles.pulsado]}
      >
        <Text style={styles.texto}>Ver animaciones del hilo</Text>
      </Pressable>
      {/* Provisional: irá en Ajustes. Cierra solo la sesión de este dispositivo. */}
      <Pressable accessibilityRole="button" onPress={() => cerrarSesion()} style={styles.cerrar}>
        <Text style={styles.cerrarTexto}>Cerrar sesión</Text>
      </Pressable>
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  aviso: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avisoTitulo: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  avisoBoton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  avisoEnlace: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.accent },
  boton: {
    marginTop: spacing.xl,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulsado: { backgroundColor: colors.accentDark },
  texto: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.white },
  cerrar: { marginTop: spacing.md, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cerrarTexto: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.textSecondary },
});
