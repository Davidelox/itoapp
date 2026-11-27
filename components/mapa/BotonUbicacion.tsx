import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { CLAVE_POSICION } from '@/lib/mapa/usePosicion';
import { estadoTrasPermiso, ofreceAjustes, textoAviso, type EstadoUbicacion } from '@/lib/mapa/ubicacion';

/**
 * «Mi ubicación» (docs/plan-mapa.md §6). Pide el permiso solo al pulsarlo; la posición se entrega a `onUbicacion` y no se
 * guarda ni se envía a ningún sitio. Denegado: aviso con enlace a Ajustes, sin volver a pedir por su cuenta.
 */
export function BotonUbicacion({ onUbicacion, style }: { onUbicacion: (lat: number, lng: number) => void; style?: StyleProp<ViewStyle> }) {
  const colors = useColores();
  const styles = useStyles();
  const [estado, setEstado] = useState<EstadoUbicacion>('libre');
  const cliente = useQueryClient();

  const pulsar = async () => {
    if (estado === 'buscando') return;
    setEstado('buscando');
    try {
      const permiso = await Location.requestForegroundPermissionsAsync();
      if (estadoTrasPermiso(permiso.granted) === 'denegado') return setEstado('denegado');
      if (!(await Location.hasServicesEnabledAsync())) return setEstado('apagado');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      cliente.setQueryData(CLAVE_POSICION, { lat: pos.coords.latitude, lng: pos.coords.longitude }); // centro de las distancias de la búsqueda
      onUbicacion(pos.coords.latitude, pos.coords.longitude);
      setEstado('libre');
    } catch {
      setEstado('error');
    }
  };

  const aviso = textoAviso(estado);
  return (
    <View style={[styles.caja, style]} pointerEvents="box-none">
      {aviso ? (
        <View style={styles.aviso} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.textoAviso}>{aviso}</Text>
          {ofreceAjustes(estado) ? (
            <Pressable accessibilityRole="link" accessibilityLabel="Abrir Ajustes" hitSlop={8} onPress={() => void Linking.openSettings()}>
              <Text style={styles.enlace}>Abrir Ajustes</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mi ubicación"
        accessibilityHint="Centra el mapa donde estás. No se guarda tu ubicación."
        accessibilityState={{ busy: estado === 'buscando' }}
        onPress={() => void pulsar()}
        style={({ pressed }) => [styles.boton, pressed && { opacity: 0.8 }]}
      >
        {estado === 'buscando' ? <ActivityIndicator color={colors.accent} /> : <Ionicons name="locate" size={24} color={colors.accent} />}
      </Pressable>
    </View>
  );
}

const useStyles = crearEstilos((colors) => ({
  caja: { position: 'absolute', alignItems: 'flex-end', gap: 8, maxWidth: '85%' },
  boton: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  aviso: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  textoAviso: { fontFamily: fonts.body, fontSize: 13, color: colors.text },
  enlace: { fontFamily: fonts.body, fontSize: 14, color: colors.accent, textDecorationLine: 'underline' },
}));
