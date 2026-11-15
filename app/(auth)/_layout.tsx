import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';

export const unstable_settings = { anchor: 'bienvenida' };

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    />
  );
}
