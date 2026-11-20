import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { BotonUbicacion } from "@/components/mapa/BotonUbicacion";
import { PinSitio } from "@/components/mapa/PinSitio";
import { encuadre } from "@/lib/mapa/encuadre";
import { etiquetaAccesible } from "@/lib/mapa/lista";
import type { Sitio } from "@/lib/mapa/tipos";
import { DELTA_UBICACION } from "@/lib/mapa/ubicacion";

export const HAY_MAPA = true;

/**
 * Pin como vista de React dentro de `Marker`. `tracksViewChanges` queda activo solo hasta el primer pintado: después
 * se apaga (rendimiento). Si alguna vez parpadea o falla con la nueva arquitectura, plan B de docs/plan-mapa.md §10:
 * PNG por categoría y estado con la prop `image`.
 */
function PinMarcador({
  sitio,
  seleccionado,
  conPlan,
  onPress,
}: {
  sitio: Sitio;
  seleccionado: boolean;
  conPlan: boolean;
  onPress: () => void;
}) {
  const [rastrear, setRastrear] = useState(true);
  // Un cambio de aspecto (estado, categoría, privado, selección) vuelve a rastrear una vez y se apaga otra vez.
  const aspecto = `${sitio.status}|${sitio.category}|${sitio.visible_to_partner}|${seleccionado}|${conPlan}`;
  const [visto, setVisto] = useState(aspecto);
  if (visto !== aspecto) {
    setVisto(aspecto);
    setRastrear(true);
  }
  useEffect(() => {
    if (!rastrear) return;
    const t = setTimeout(() => setRastrear(false), 500);
    return () => clearTimeout(t);
  }, [rastrear]);
  return (
    <Marker
      coordinate={{ latitude: sitio.lat, longitude: sitio.lng }}
      tracksViewChanges={rastrear}
      anchor={{ x: 0.5, y: 1 }}
      accessibilityLabel={conPlan ? `${etiquetaAccesible(sitio)}, con plan próximo` : etiquetaAccesible(sitio)}
      onPress={(e) => {
        e.stopPropagation();
        onPress();
      }}
      zIndex={seleccionado ? 2 : 1}
    >
      <View style={seleccionado ? styles.grande : undefined}>
        <PinSitio
          categoria={sitio.category}
          estado={sitio.status}
          privado={!sitio.visible_to_partner}
          conPlan={conPlan}
          conPico
        />
      </View>
    </Marker>
  );
}

/** Vista Mapa (docs/plan-mapa.md §5.1): Apple Maps en iOS y Google Maps en Android (proveedor por defecto, sin clave en Expo Go). */
export function MapaSitios({
  sitios,
  seleccionado,
  conPlan,
  onSeleccionar,
  onMantener,
}: {
  sitios: Sitio[];
  /** Ids de sitios con un evento futuro enlazado. */
  conPlan?: ReadonlySet<string>;
  seleccionado: string | null;
  onSeleccionar: (id: string | null) => void;
  onMantener?: (lat: number, lng: number) => void;
}) {
  // Solo el encuadre inicial: al filtrar o llegar cambios, el mapa no salta mientras se está mirando.
  const [inicial] = useState(() => encuadre(sitios));
  const mapa = useRef<MapView>(null);
  const [conPunto, setConPunto] = useState(false);
  return (
    <>
      <MapView
        ref={mapa}
        style={StyleSheet.absoluteFill}
        showsUserLocation={conPunto}
        showsMyLocationButton={false}
        initialRegion={inicial}
        mapType={Platform.OS === "ios" ? "mutedStandard" : "standard"}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        onPress={() => onSeleccionar(null)}
        onLongPress={(e) =>
          onMantener?.(
            e.nativeEvent.coordinate.latitude,
            e.nativeEvent.coordinate.longitude,
          )
        }
        accessibilityLabel="Mapa de vuestros sitios"
      >
        {sitios.map((s) => (
          <PinMarcador
            key={s.id}
            sitio={s}
            seleccionado={s.id === seleccionado}
            conPlan={!!conPlan?.has(s.id)}
            onPress={() => onSeleccionar(s.id)}
          />
        ))}
      </MapView>
      <BotonUbicacion
        style={styles.ubicacion}
        onUbicacion={(latitude, longitude) => {
          setConPunto(true);
          mapa.current?.animateToRegion(
            {
              latitude,
              longitude,
              latitudeDelta: DELTA_UBICACION,
              longitudeDelta: DELTA_UBICACION,
            },
            400,
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  ubicacion: { right: 16, top: 16 },
  grande: { transform: [{ scale: 1.15 }] },
});
