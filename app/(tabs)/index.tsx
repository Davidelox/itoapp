import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { colors, fonts, radius, spacing } from '@/constants/theme';

export default function Screen() {
  const router = useRouter();
  return (
    <PlaceholderScreen title="Inicio">
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

const styles = StyleSheet.create({
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
