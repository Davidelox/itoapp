import { useEffect, useRef, useState } from "react";
import { Keyboard, Platform, StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { BotonUbicacion } from "@/components/mapa/BotonUbicacion";
import { PinResultado } from "@/components/mapa/PinResultado";
import { PinSitio } from "@/components/mapa/PinSitio";
import type { SitioBuscado } from "@/lib/mapa/busqueda";
import { planZoom, regionDeResultado } from "@/lib/mapa/resultados";
import { DELTA_MINIMO, type Region, encuadre } from "@/lib/mapa/encuadre";
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
  emoji,
  onPress,
}: {
  sitio: Sitio;
  seleccionado: boolean;
  conPlan: boolean;
  emoji: string | null;
  onPress: () => void;
}) {
  const [rastrear, setRastrear] = useState(true);
  // Un cambio de aspecto (estado, categoría, privado, selección) vuelve a rastrear una vez y se apaga otra vez.
  const aspecto = `${sitio.status}|${sitio.category}|${sitio.visible_to_partner}|${seleccionado}|${conPlan}|${emoji}`;
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
          emoji={emoji}
          conPico
          enMapa
        />
      </View>
    </Marker>
  );
}

/** Pin de un resultado de búsqueda (neutro oscuro, con número). Apaga `tracksViewChanges` tras pintarse, como `PinMarcador`. */
function PinResultadoMarcador({ resultado, numero, activo, onPress }: { resultado: SitioBuscado; numero: number; activo: boolean; onPress: () => void }) {
  const [rastrear, setRastrear] = useState(true);
  const aspecto = `${numero}|${activo}`;
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
      coordinate={{ latitude: resultado.lat, longitude: resultado.lng }}
      tracksViewChanges={rastrear}
      anchor={{ x: 0.5, y: 1 }}
      accessibilityLabel={`Resultado ${numero}: ${resultado.nombre}`}
      onPress={(e) => {
        e.stopPropagation();
        onPress();
      }}
      zIndex={activo ? 4 : 3}
    >
      <PinResultado numero={numero} activo={activo} />
    </Marker>
  );
}

/** Vista Mapa (docs/plan-mapa.md §5.1): Apple Maps en iOS y Google Maps en Android (proveedor por defecto, sin clave en Expo Go). */
export function MapaSitios({
  sitios,
  seleccionado,
  conPlan,
  emojis,
  onSeleccionar,
  onMantener,
  resultados,
  resultadoSel = null,
  extra = null,
  onResultado,
  onRegion,
  enfoque,
}: {
  sitios: Sitio[];
  /** Emoji del pin por id de sitio (el de su colección principal o la filtrada); sin entrada, el icono de la categoría. */
  emojis?: ReadonlyMap<string, string>;
  /** Ids de sitios con un evento futuro enlazado. */
  conPlan?: ReadonlySet<string>;
  seleccionado: string | null;
  onSeleccionar: (id: string | null) => void;
  onMantener?: (lat: number, lng: number) => void;
  /** Resultados de la búsqueda en el mapa (pines aparte, neutros) y el elegido. Al llegar nuevos, el mapa los encuadra. */
  resultados?: SitioBuscado[];
  resultadoSel?: string | null;
  /** Resultado elegido desde las sugerencias que no está entre los de la consulta: un pin más. */
  extra?: SitioBuscado | null;
  onResultado?: (id: string | null) => void;
  /** Región al terminar de moverse el mapa. */
  onRegion?: (r: Region) => void;
  /** Llevar el mapa a un sitio (desde la ficha): cada `clave` nueva anima de nuevo. */
  enfoque?: { lat: number; lng: number; clave: number } | null;
}) {
  // Solo el encuadre inicial: al filtrar o llegar cambios, el mapa no salta mientras se está mirando.
  const [inicial] = useState<Region>(() =>
    enfoque ? { latitude: enfoque.lat, longitude: enfoque.lng, latitudeDelta: DELTA_UBICACION, longitudeDelta: DELTA_UBICACION } : encuadre(sitios),
  );
  const mapa = useRef<MapView>(null);
  const [conPunto, setConPunto] = useState(false);
  const claveEnfoque = useRef(enfoque?.clave ?? 0);
  useEffect(() => {
    if (!enfoque || enfoque.clave === claveEnfoque.current) return;
    claveEnfoque.current = enfoque.clave;
    mapa.current?.animateToRegion({ latitude: enfoque.lat, longitude: enfoque.lng, latitudeDelta: DELTA_UBICACION, longitudeDelta: DELTA_UBICACION }, 500);
  }, [enfoque]);
  const ultima = useRef<Region | null>(null);
  const previa = useRef<Region | null>(null);
  const eraSel = useRef<string | null>(null);
  // Al elegir un resultado (pin o fila) el mapa hace zoom a él; otro resultado, otro zoom; al deseleccionar vuelve a la región de antes.
  useEffect(() => {
    const r = resultadoSel ? (resultados?.find((x) => x.provider_place_id === resultadoSel) ?? (extra?.provider_place_id === resultadoSel ? extra : undefined)) : undefined;
    const plan = planZoom<Region>(eraSel.current, resultadoSel && r ? resultadoSel : null, previa.current, ultima.current, r ? regionDeResultado(r) : null);
    eraSel.current = resultadoSel && r ? resultadoSel : null;
    previa.current = plan.previa;
    if (plan.ir) mapa.current?.animateToRegion(plan.ir, 500);
    // Solo al cambiar la elección: no al llegar resultados nuevos (esos se encuadran abajo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultadoSel]);
  // Al llegar resultados nuevos se encuadran (con hueco para la barra de arriba y la lista de abajo).
  useEffect(() => {
    if (!resultados || resultados.length === 0) return;
    if (resultados.length === 1) {
      mapa.current?.animateToRegion({ latitude: resultados[0].lat, longitude: resultados[0].lng, latitudeDelta: Math.max(DELTA_MINIMO, DELTA_UBICACION), longitudeDelta: DELTA_UBICACION }, 400);
      return;
    }
    mapa.current?.fitToCoordinates(
      resultados.map((r) => ({ latitude: r.lat, longitude: r.lng })),
      { edgePadding: { top: 110, right: 50, bottom: 230, left: 50 }, animated: true },
    );
  }, [resultados]);
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
        onPress={() => {
          // Con el teclado abierto, tocar el mapa solo lo cierra (no deselecciona nada).
          if (Keyboard.isVisible()) return Keyboard.dismiss();
          onSeleccionar(null);
          onResultado?.(null);
        }}
        onPanDrag={() => Keyboard.dismiss()}
        onRegionChangeComplete={(r) => {
          ultima.current = r;
          onRegion?.(r);
        }}
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
            emoji={emojis?.get(s.id) ?? null}
            onPress={() => onSeleccionar(s.id)}
          />
        ))}
        {resultados?.map((r, i) => (
          <PinResultadoMarcador key={r.provider_place_id} resultado={r} numero={i + 1} activo={r.provider_place_id === resultadoSel} onPress={() => {
              Keyboard.dismiss();
              onResultado?.(r.provider_place_id);
            }} />
        ))}
        {extra && !resultados?.some((x) => x.provider_place_id === extra.provider_place_id) ? (
          <PinResultadoMarcador
            resultado={extra}
            numero={(resultados?.length ?? 0) + 1}
            activo={extra.provider_place_id === resultadoSel}
            onPress={() => {
              Keyboard.dismiss();
              onResultado?.(extra.provider_place_id);
            }}
          />
        ) : null}
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
