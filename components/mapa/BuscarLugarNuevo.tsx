import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { MensajeError } from "@/components/onboarding/MensajeError";
import { colors, fonts, radius } from "@/constants/theme";
import { ErrorGasto } from "@/lib/gastos/error";
import {
  PAUSA_BUSQUEDA_MS,
  type SitioBuscado,
  textoBuscable,
} from "@/lib/mapa/busqueda";
import { INFO_CATEGORIA_SITIO } from "@/lib/mapa/categorias";
import {
  buscarSitios,
  crearSitio,
  sitioDeBusqueda,
} from "@/lib/mapa/consultas";
import { ERROR_GENERICO } from "@/lib/mapa/error";
import { fusionarConGuardados, lineaResultado } from "@/lib/mapa/resultados";
import { formularioDeResultado } from "@/lib/mapa/sitio";
import type { Sitio } from "@/lib/mapa/tipos";
import { usePosicion } from "@/lib/mapa/usePosicion";
import { useInvalidarMapa } from "@/lib/mapa/useSitios";

/**
 * «Buscar lugar nuevo» dentro de la hoja de `CampoSitio`: busca en Photon (como «Guardar sitio»), y al elegir un
 * resultado lo guarda como sitio nuevo («Quiero ir», compartido) y lo devuelve elegido. Si ya está guardado, devuelve el existente.
 */
export function BuscarLugarNuevo({
  sitios,
  coupleId,
  onElegido,
}: {
  sitios: Sitio[];
  coupleId: string;
  onElegido: (id: string) => void;
}) {
  const centro = usePosicion();
  const invalidar = useInvalidarMapa();
  const [escrito, setEscrito] = useState("");
  const [consulta, setConsulta] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );
  const busqueda = useQuery({
    queryKey: [
      "mapa-busqueda",
      consulta,
      centro ? `${centro.lat.toFixed(3)},${centro.lng.toFixed(3)}` : null,
    ],
    queryFn: ({ signal }) =>
      buscarSitios(consulta as string, centro ?? undefined, signal),
    enabled: consulta !== null,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const escribir = (t: string) => {
    setEscrito(t);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(
      () => setConsulta(textoBuscable(t)),
      PAUSA_BUSQUEDA_MS,
    );
  };
  const filas = busqueda.data
    ? fusionarConGuardados(busqueda.data, sitios)
    : [];

  const elegir = async (r: SitioBuscado, guardado: Sitio | null) => {
    Keyboard.dismiss();
    setError(null);
    if (guardado) return onElegido(guardado.id);
    setGuardando(r.provider_place_id);
    try {
      const id = Crypto.randomUUID();
      let elegido = id;
      try {
        await crearSitio(id, coupleId, formularioDeResultado(r));
      } catch (e) {
        // Ya estaba guardado (lo compartió la pareja o lo guardaste tú): se elige ese en vez de duplicarlo.
        const existente =
          e instanceof ErrorGasto && e.codigo === "23505"
            ? await sitioDeBusqueda(r.provider_place_id).catch(() => null)
            : null;
        if (!existente) throw e;
        elegido = existente;
      }
      // Hasta que el sitio no está en la caché, el campo diría «Sitio no disponible».
      await invalidar();
      onElegido(elegido);
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
    } finally {
      setGuardando(null);
    }
  };

  return (
    <View style={styles.raiz}>
      <TextInput
        accessibilityLabel="Buscar lugar nuevo"
        value={escrito}
        onChangeText={escribir}
        maxLength={100}
        placeholder="Nombre del sitio y ciudad"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={styles.campo}
      />
      {busqueda.isFetching ? (
        <View style={styles.estado} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.nota}>Buscando…</Text>
        </View>
      ) : busqueda.isError ? (
        <MensajeError
          texto={
            busqueda.error instanceof ErrorGasto
              ? busqueda.error.message
              : ERROR_GENERICO
          }
        />
      ) : consulta === null ? (
        <Text style={styles.nota}>
          Escribe al menos 2 letras. Se guardará en vuestro mapa como «Quiero
          ir».
        </Text>
      ) : busqueda.data && busqueda.data.length === 0 ? (
        <Text style={styles.nota}>
          No hay resultados. Prueba con otro nombre.
        </Text>
      ) : null}
      <MensajeError texto={error} />
      {!busqueda.isFetching
        ? filas.map(({ resultado: r, guardado }) => (
            <Pressable
              key={r.provider_place_id}
              accessibilityRole="button"
              accessibilityLabel={`${r.nombre}${lineaResultado(r) ? `, ${lineaResultado(r)}` : ""}${guardado ? ", ya está en vuestro mapa" : ", se guardará como sitio nuevo"}`}
              accessibilityState={{
                busy: guardando === r.provider_place_id,
                disabled: guardando !== null,
              }}
              disabled={guardando !== null}
              onPress={() => elegir(r, guardado)}
              style={({ pressed }) => [
                styles.resultado,
                pressed && { backgroundColor: colors.surface },
              ]}
            >
              <Ionicons
                name={INFO_CATEGORIA_SITIO[r.categoria].icono}
                size={20}
                color={colors.accent}
              />
              <View style={styles.textos}>
                <Text style={styles.nombre} numberOfLines={1}>
                  {r.nombre}
                </Text>
                {lineaResultado(r) ? (
                  <Text style={styles.nota} numberOfLines={1}>
                    {lineaResultado(r)}
                  </Text>
                ) : null}
              </View>
              {guardando === r.provider_place_id ? (
                <ActivityIndicator color={colors.accent} />
              ) : guardado ? (
                <Text style={styles.guardado}>Guardado</Text>
              ) : null}
            </Pressable>
          ))
        : null}
      <Text style={styles.nota}>Datos © OpenStreetMap</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { gap: 10 },
  campo: {
    height: 50,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.white,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
  },
  estado: { flexDirection: "row", alignItems: "center", gap: 8 },
  nota: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  resultado: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  textos: { flex: 1, minWidth: 0 },
  nombre: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  guardado: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.accent },
});
