import { Ionicons } from "@expo/vector-icons";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Marcador } from "@/components/calendario/Marcador";
import { colors, fonts, radius } from "@/constants/theme";
import type { Filtros } from "@/lib/calendario/agrupar";
import { marcadorFiltro } from "@/lib/calendario/colores";
import {
  OPCIONES_FILTRO,
  type Rect,
  alternarFiltro,
  posicionMenu,
} from "@/lib/calendario/filtros";

const ANCHO_MENU = 224;
const ALTO_FILA = 44;
const PADDING_MENU = 6;
/** Alto de las opciones sin recortar; si no caben en la ventana, la lista se desplaza. */
const ALTO_LISTA = OPCIONES_FILTRO.length * ALTO_FILA;
/** Lo que ocupan el separador (1), el pie con «Limpiar» y «Listo» y el relleno. */
const ALTO_FIJO = 1 + ALTO_FILA + 2 * PADDING_MENU;

/**
 * Menú de filtros anclado al botón del embudo (docs/plan-calendario-v3.md §3): una tarjeta bajo el botón, en un
 * `Modal` transparente para que tape toda la pantalla. Cada fila es una casilla (se pueden marcar varias) y NO se
 * cierra al marcar; se cierra con «Listo», tocando fuera, Atrás en Android o Escape en web. «Limpiar» desmarca todas.
 * `boton`: dónde está el botón en la ventana (`measureInWindow`).
 */
export function MenuFiltros({
  visible,
  boton,
  valor,
  onCambiar,
  onCerrar,
}: {
  visible: boolean;
  boton: Rect | null;
  valor: Filtros;
  onCambiar: (f: Filtros) => void;
  onCerrar: () => void;
}) {
  const ventana = useWindowDimensions();
  // Sin medida no hay dónde anclarlo. Con ella, el `Modal` sigue montado y `visible` lo abre y lo cierra (con fundido).
  if (!boton) return null;
  const altoLista = Math.min(
    ALTO_LISTA,
    Math.max(4 * ALTO_FILA, ventana.height * 0.7 - ALTO_FIJO),
  );
  const { top, left } = posicionMenu(boton, ventana, {
    ancho: ANCHO_MENU,
    alto: altoLista + ALTO_FIJO,
  });
  const hayFiltros = valor.length > 0;
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onCerrar}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar filtros"
        onPress={onCerrar}
        style={styles.fondo}
      />
      <View
        accessibilityViewIsModal
        onAccessibilityEscape={onCerrar}
        accessibilityLabel="Filtrar por tipo"
        style={[styles.menu, { top, left }]}
      >
        <ScrollView
          style={{ height: altoLista }}
          showsVerticalScrollIndicator={false}
        >
          {OPCIONES_FILTRO.map((o, i) => {
            const marcada = valor.includes(o.valor);
            return (
              <Animated.View
                key={o.valor}
                entering={FadeInDown.delay(i * 18).duration(140)}
              >
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: marcada }}
                  accessibilityLabel={o.etiqueta}
                  onPress={() => onCambiar(alternarFiltro(valor, o.valor))}
                  style={({ pressed }) => [
                    styles.fila,
                    marcada && styles.filaMarcada,
                    pressed && styles.filaPulsada,
                  ]}
                >
                  <Marcador marcador={marcadorFiltro(o, marcada)} tamano={22} />
                  <Text
                    style={[styles.etiqueta, marcada && styles.etiquetaMarcada]}
                    numberOfLines={1}
                  >
                    {o.etiqueta}
                  </Text>
                  <View
                    style={[styles.casilla, marcada && styles.casillaMarcada]}
                  >
                    {marcada ? (
                      <Ionicons
                        name="checkmark"
                        size={14}
                        color={colors.white}
                      />
                    ) : null}
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}
        </ScrollView>
        <View style={styles.separador} />
        <View style={styles.pie}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Limpiar filtros"
            accessibilityState={{ disabled: !hayFiltros }}
            disabled={!hayFiltros}
            onPress={() => onCambiar([])}
            hitSlop={{ top: 0, bottom: 0, left: 6, right: 6 }}
            style={styles.botonPie}
          >
            <Text
              style={[styles.limpiar, !hayFiltros && styles.limpiarApagado]}
            >
              Limpiar
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Listo"
            onPress={onCerrar}
            hitSlop={{ top: 0, bottom: 0, left: 6, right: 6 }}
            style={styles.botonPie}
          >
            <Text style={styles.listo}>Listo</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(42, 38, 39, 0.08)",
  },
  menu: {
    position: "absolute",
    width: ANCHO_MENU,
    paddingVertical: PADDING_MENU,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#7A3419",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  fila: {
    height: ALTO_FILA,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
  },
  filaMarcada: { backgroundColor: colors.accentSoft },
  filaPulsada: { backgroundColor: colors.pressed },
  etiqueta: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.text,
  },
  etiquetaMarcada: { fontFamily: fonts.bodyBold, color: colors.accent },
  casilla: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.inputBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  casillaMarcada: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  separador: {
    height: 1,
    backgroundColor: colors.divider,
    marginHorizontal: 8,
  },
  pie: {
    height: ALTO_FILA,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  botonPie: { minHeight: ALTO_FILA, justifyContent: "center" },
  limpiar: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.textSecondary,
  },
  limpiarApagado: { opacity: 0.4 },
  listo: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.accent },
});
