import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Damion_400Regular } from '@expo-google-fonts/damion';
import { Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Avisos } from '@/components/avisos/Avisos';
import { SplashHilo } from '@/components/hilo/SplashHilo';
import { cargarTema, useColores } from '@/lib/tema';
import { FlujoCuentaProvider } from '@/lib/auth/FlujoCuenta';
import { SesionProvider } from '@/lib/auth/SesionProvider';
import { QueryProvider } from '@/lib/consultas/QueryProvider';
import { ENTRADA_FASE, EstadoProvider, useEstado } from '@/lib/pareja/EstadoProvider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Damion_400Regular,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  // GestureHandlerRootView: los gestos (deslizar el calendario para cambiar de periodo) lo necesitan en la raíz.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SesionProvider>
        <QueryProvider>
          <FlujoCuentaProvider>
            <EstadoProvider>
              <Raiz fuentesListas={fontsLoaded || !!fontError} />
            </EstadoProvider>
          </FlujoCuentaProvider>
        </QueryProvider>
      </SesionProvider>
    </GestureHandlerRootView>
  );
}

function Raiz({ fuentesListas }: { fuentesListas: boolean }) {
  const { fase } = useEstado();
  // El arranque termina cuando hay fuentes y se conoce la fase; después, un «cargando» (al entrar) ya se pinta.
  const [arrancada, setArrancada] = useState(false);
  // La preferencia de tema (Sistema / Claro / Oscuro) se aplica antes de pintar nada, para que no parpadee.
  const [temaListo, setTemaListo] = useState(false);
  useEffect(() => {
    cargarTema().then(() => setTemaListo(true));
  }, []);
  const lista = temaListo && fuentesListas && (arrancada || fase !== 'cargando');
  if (lista && !arrancada) setArrancada(true);

  useEffect(() => {
    if (lista) SplashScreen.hideAsync();
  }, [lista]);

  if (!lista) {
    return null;
  }
  return <Navegacion />;
}

function Navegacion() {
  const colors = useColores();
  const { fase } = useEstado();
  // La capa del hilo se muestra una vez por arranque, cuando ya se sabe qué pantalla toca. Hacia dónde
  // acaba el hilo se decide aquí, una sola vez: con el espacio listo hay barra de pestañas.
  const [mostrarSplash, setMostrarSplash] = useState(true);
  const cerrarSplash = useCallback(() => setMostrarSplash(false), []);
  const [destino] = useState<'barra' | 'centro'>(() => (fase === 'lista' ? 'barra' : 'centro'));

  const con = (f: typeof fase) => fase === f;
  // Sin `redirectTo`, expo-router lleva al primer grupo permitido («/(auth)»), que no tiene index: «Unmatched Route».
  const entrada = ENTRADA_FASE[fase];
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Protected guard={con('cargando')} redirectTo={entrada}>
          <Stack.Screen name="cargando" />
        </Stack.Protected>
        <Stack.Protected guard={con('sin_sesion')} redirectTo={entrada}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={con('sin_pareja') || con('sin_perfil') || con('dinero') || con('invitar')} redirectTo={entrada}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={con('sin_conexion')} redirectTo={entrada}>
          <Stack.Screen name="sin-conexion" />
        </Stack.Protected>
        <Stack.Protected guard={con('lista')} redirectTo={entrada}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="pareja/invitar" />
          <Stack.Screen name="gastos/nuevo" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="gastos/[id]" />
          <Stack.Screen name="gastos/editar/[id]" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="gastos/historial" />
          <Stack.Screen name="gastos/pago/[id]" />
          <Stack.Screen name="gastos/bote" />
          <Stack.Screen name="gastos/movimiento/[id]" />
          <Stack.Screen name="ajustes/index" />
          <Stack.Screen name="gastos/recurrentes" />
          <Stack.Screen name="gastos/recurrente/nuevo" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="gastos/recurrente/[id]" />
          <Stack.Screen name="calendario/nuevo" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="calendario/evento/[id]" />
          <Stack.Screen name="calendario/editar/[id]" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="mapa/nuevo" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="mapa/sitio/[id]" />
          <Stack.Screen name="mapa/colecciones" />
          <Stack.Screen name="mapa/coleccion/nueva" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="mapa/coleccion/[id]/index" />
          <Stack.Screen name="mapa/coleccion/[id]/editar" />
          <Stack.Screen name="planificador/nuevo" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="planificador/[id]/index" />
          <Stack.Screen name="planificador/[id]/editar" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="laboratorio/index" />
          {/* Sin animación de pila: la transición la hace el hilo (components/hilo/TirarDelHilo.tsx). */}
          <Stack.Screen name="laboratorio/detalle" options={{ animation: 'none' }} />
        </Stack.Protected>
        {/* Sin guarda: procesa el enlace del email esté o no iniciada la sesión. */}
        <Stack.Screen name="auth/callback" />
      </Stack>
      <Avisos />
      {mostrarSplash && <SplashHilo onDone={cerrarSplash} destino={destino} />}
    </View>
  );
}
