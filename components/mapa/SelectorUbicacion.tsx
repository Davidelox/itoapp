import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView from 'react-native-maps';

import { BotonUbicacion } from '@/components/mapa/BotonUbicacion';
import { colors, radius } from '@/constants/theme';
import { DELTA_MINIMO, type Region } from '@/lib/mapa/encuadre';
import { DELTA_UBICACION } from '@/lib/mapa/ubicacion';

/** ¿Hay mapa para colocar el pin? (En web no: `SelectorUbicacion.web.tsx` pide las coordenadas escritas.) */
export const SELECTOR_CON_MAPA = true;

/**
 * Ubicación a mano (docs/plan-mapa.md §5.3): mapa con una cruz fija en el centro; el sitio queda donde se suelta el
 * mapa. `inicial` solo fija el encuadre de partida. «Mi ubicación» (opcional) pone la cruz donde estás; solo pide permiso al pulsarlo.
 */
export function SelectorUbicacion({ inicial, onCambiar }: { inicial: Region; onCambiar: (lat: number, lng: number) => void }) {
  const mapa = useRef<MapView>(null);
  return (
    <View style={styles.caja} accessible accessibilityLabel="Mapa para elegir la ubicación. Mueve el mapa hasta que la cruz quede sobre el sitio.">
      <MapView
        ref={mapa}
        showsMyLocationButton={false}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...inicial, latitudeDelta: Math.max(inicial.latitudeDelta, DELTA_MINIMO), longitudeDelta: Math.max(inicial.longitudeDelta, DELTA_MINIMO) }}
        mapType="standard"
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        onRegionChangeComplete={(r) => onCambiar(r.latitude, r.longitude)}
      />
      <View pointerEvents="none" style={styles.cruz}>
        <Ionicons name="add" size={36} color={colors.accent} />
      </View>
      <BotonUbicacion
        style={styles.ubicacion}
        onUbicacion={(latitude, longitude) => mapa.current?.animateToRegion({ latitude, longitude, latitudeDelta: DELTA_UBICACION, longitudeDelta: DELTA_UBICACION }, 400)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { height: 260, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  ubicacion: { right: 8, top: 8 },
  cruz: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
