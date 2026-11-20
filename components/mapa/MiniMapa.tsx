import { Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { PinSitio } from '@/components/mapa/PinSitio';
import { radius } from '@/constants/theme';
import type { CategoriaSitio, EstadoSitio } from '@/lib/mapa/tipos';

/** Minimapa de la ficha (160 px): sin gestos; es un botón «Ver en el mapa» que abre la pestaña Mapa en este sitio. */
export function MiniMapa({ lat, lng, categoria, estado, privado, onPress }: { lat: number; lng: number; categoria: CategoriaSitio; estado: EstadoSitio; privado: boolean; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Ver en el mapa" onPress={onPress} style={styles.caja}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
        mapType="standard"
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsPointsOfInterests={false}
      >
        <Marker coordinate={{ latitude: lat, longitude: lng }} tracksViewChanges={false} anchor={{ x: 0.5, y: 1 }}>
          <PinSitio categoria={categoria} estado={estado} privado={privado} conPico enMapa />
        </Marker>
      </MapView>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  caja: { height: 160, borderRadius: radius.lg, overflow: 'hidden' },
});
