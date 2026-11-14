import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Damion_400Regular } from '@expo-google-fonts/damion';
import { Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { SplashHilo } from '@/components/hilo/SplashHilo';
import { colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // La capa del hilo se muestra una vez por arranque de la app.
  const [mostrarSplash, setMostrarSplash] = useState(true);
  const cerrarSplash = useCallback(() => setMostrarSplash(false), []);
  const [fontsLoaded, fontError] = useFonts({
    Damion_400Regular,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        {/* Sin animación de pila: la transición la hace el hilo (components/hilo/TirarDelHilo.tsx). */}
        <Stack.Screen name="laboratorio/detalle" options={{ animation: 'none' }} />
      </Stack>
      {mostrarSplash && <SplashHilo onDone={cerrarSplash} />}
    </View>
  );
}
