import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { type ComponentProps } from 'react';

import { TabBarHilo } from '@/components/hilo/TabBarHilo';
import { useColores } from '@/lib/tema';
import { useTiempoRealGastos } from '@/lib/gastos/useGastos';
import { useTiempoRealMapa } from '@/lib/mapa/useSitios';
import { useTiempoRealPlanificador } from '@/lib/planificador/usePlanificador';

type IconName = ComponentProps<typeof Ionicons>['name'];

const tabs: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Inicio', icon: 'home-outline' },
  { name: 'gastos', title: 'Gastos', icon: 'wallet-outline' },
  { name: 'calendario', title: 'Calendario', icon: 'calendar-outline' },
  { name: 'mapa', title: 'Mapa', icon: 'location-outline' },
  { name: 'planificador', title: 'Planificador', icon: 'briefcase-outline' },
];

export default function TabsLayout() {
  const colors = useColores();
  // Las pestañas siguen montadas debajo del detalle y del formulario: el canal vive aquí.
  useTiempoRealGastos();
  useTiempoRealMapa();
  useTiempoRealPlanificador();
  return (
    <Tabs
      tabBar={(props) => <TabBarHilo {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
    >
      {tabs.map(({ name, title, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, size }) => <Ionicons name={icon} size={size} color={color as string} />,
          }}
        />
      ))}
    </Tabs>
  );
}
