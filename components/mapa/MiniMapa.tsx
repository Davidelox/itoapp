import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { PinSitio } from '@/components/mapa/PinSitio';
import { radius } from '@/constants/theme';
import type { CategoriaSitio, EstadoSitio } from '@/lib/mapa/tipos';

/** Minimapa fijo de la ficha (160 px): sin gestos y oculto a los lectores de pantalla (la dirección va en texto). */
export function MiniMapa({ lat, lng, categoria, estado, privado }: { lat: number; lng: number; categoria: CategoriaSitio; estado: EstadoSitio; privado: boolean }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.caja}>
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
          <PinSitio categoria={categoria} estado={estado} privado={privado} conPico />
        </Marker>
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { height: 160, borderRadius: radius.lg, overflow: 'hidden' },
});
