import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';
import { ENTRADA_FASE, useEstado } from '@/lib/pareja/EstadoProvider';

/**
 * Cada pantalla solo existe en su fase: al cambiar la fase el router lleva solo a la pantalla correcta
 * y Atrás no puede volver a una fase superada.
 */
export default function OnboardingLayout() {
  const { fase } = useEstado();
  const entrada = ENTRADA_FASE[fase];
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={fase === 'sin_pareja'} redirectTo={entrada}>
        <Stack.Screen name="pareja" />
        <Stack.Screen name="unirse" />
      </Stack.Protected>
      <Stack.Protected guard={fase === 'sin_perfil'} redirectTo={entrada}>
        <Stack.Screen name="perfil" />
      </Stack.Protected>
      <Stack.Protected guard={fase === 'dinero'} redirectTo={entrada}>
        <Stack.Screen name="dinero" />
      </Stack.Protected>
      <Stack.Protected guard={fase === 'invitar'} redirectTo={entrada}>
        <Stack.Screen name="invitar" />
      </Stack.Protected>
    </Stack>
  );
}
