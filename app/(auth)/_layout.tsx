import { Stack } from 'expo-router';

import { useColores } from '@/lib/tema';

export const unstable_settings = { anchor: 'bienvenida' };

export default function AuthLayout() {
  const colors = useColores();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    />
  );
}
