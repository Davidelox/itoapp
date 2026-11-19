import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TarjetasPendientes } from '@/components/inicio/TarjetasPendientes';
import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { useDatosAjustes } from '@/lib/gastos/useGastos';
import { useEstado } from '@/lib/pareja/EstadoProvider';

export default function Screen() {
  const router = useRouter();
  const { pareja } = useEstado();
  const sinPareja = useDatosAjustes().data?.sinPareja;
  return (
    <PlaceholderScreen title="Inicio" accion={<AvataresCabecera />} proximamente={false}>
      <TarjetasPendientes />
      {pareja && pareja.otra === null && sinPareja?.estado !== 'borrada' ? (
        <View style={styles.aviso}>
          <Text style={styles.avisoTitulo}>
            {sinPareja?.estado === 'salio' ? `${sinPareja.nombre} salió del espacio` : 'Tu pareja aún no se ha unido'}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/pareja/invitar')} style={styles.avisoBoton}>
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
    </PlaceholderScreen>
  );
}

/** Los dos avatares de la cabecera: abren Ajustes (docs/concepto.md: los ajustes se abren desde la cabecera). */
function AvataresCabecera() {
  const router = useRouter();
  const { pareja } = useEstado();
  if (!pareja) return null;
  const otra = pareja.otra;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ajustes y perfil de pareja"
      onPress={() => router.push('/ajustes')}
      hitSlop={8}
      style={({ pressed }) => [styles.avatares, pressed && { opacity: 0.7 }]}
    >
      <AvatarPersona nombre={pareja.yo.nombre} color={pareja.yo.color} avatarPath={pareja.yo.avatarPath} tamano={38} />
      <View style={styles.solapa}>
        {otra ? (
          <AvatarPersona nombre={otra.nombre} color={otra.color} avatarPath={otra.avatarPath} tamano={38} />
        ) : (
          <AvatarPersona nombre="" color={null} tamano={38} vacio="+" />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatares: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  solapa: { marginLeft: -12, borderRadius: 22, borderWidth: 2, borderColor: colors.background },
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
});
