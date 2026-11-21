import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Chip, FilaChips } from "@/components/gastos/Controles";
import { colors, fonts, radius } from "@/constants/theme";
import {
  INICIALES_SEMANA,
  esDomingo,
  etiquetaMes,
  moverMes,
  primeroDelMes,
  semanasDelMes,
  sumarDias,
} from "@/lib/calendario/rejilla";
import {
  ayerISO,
  deISO,
  fechaCorta,
  fechaLarga,
  hoyISO,
} from "@/lib/gastos/fechas";

/** Qué fechas se pueden elegir: un gasto (hasta hoy), un evento futuro (desde hoy) o cualquier día. */
export type ModoFecha = "gasto" | "futuras" | "todas";

/**
 * Fecha de un gasto («Hoy», «Ayer» u «Otro día…», sin fechas futuras), de un evento («Hoy», «Mañana» u
 * «Otro día…»; con `modo = 'futuras'` sin fechas pasadas, con `'todas'` sin ningún límite: se puede apuntar algo
 * que ya pasó). «Otro día…» abre un calendario de un mes.
 */
export function SelectorFecha({
  valor,
  onCambiar,
  modo = "gasto",
}: {
  valor: string;
  onCambiar: (iso: string) => void;
  modo?: ModoFecha;
}) {
  const [abierto, setAbierto] = useState(false);
  const hoy = hoyISO();
  const hacia = modo !== "gasto";
  const otroDia = hacia ? sumarDias(hoy, 1) : ayerISO();
  const otro = valor !== hoy && valor !== otroDia;
  return (
    <>
      <FilaChips>
        <Chip
          etiqueta="Hoy"
          rol="radio"
          activo={valor === hoy}
          onPress={() => onCambiar(hoy)}
        />
        <Chip
          etiqueta={hacia ? "Mañana" : "Ayer"}
          rol="radio"
          activo={valor === otroDia}
          onPress={() => onCambiar(otroDia)}
        />
        <Chip
          etiqueta={otro ? fechaCorta(valor) : "Otro día…"}
          rol="radio"
          activo={otro}
          onPress={() => setAbierto(true)}
        />
      </FilaChips>
      <Modal
        visible={abierto}
        transparent
        animationType="slide"
        onRequestClose={() => setAbierto(false)}
      >
        <Calendario
          inicial={valor}
          minimo={modo === "futuras" ? hoy : undefined}
          maximo={modo === "gasto" ? hoy : undefined}
          onElegir={(iso) => {
            onCambiar(iso);
            setAbierto(false);
          }}
          onCerrar={() => setAbierto(false)}
        />
      </Modal>
    </>
  );
}

/**
 * Un botón con una fecha que abre el mismo calendario de un mes: el «Hasta» de un evento de varios días.
 * Los días anteriores a `minimo` salen bloqueados y, con `rangoDesde`, se resalta el rango hasta `valor`.
 */
export function BotonFecha({
  valor,
  texto,
  etiqueta,
  minimo,
  maximo,
  rangoDesde,
  onCambiar,
}: {
  valor: string;
  /** Lo que dice el botón: «Dom 16 nov · 3 días». */
  texto: string;
  /** Etiqueta de accesibilidad: «Hasta: domingo 16 nov, 3 días». */
  etiqueta: string;
  minimo?: string;
  maximo?: string;
  rangoDesde?: string;
  onCambiar: (iso: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={etiqueta}
        accessibilityHint="Abre el calendario"
        onPress={() => setAbierto(true)}
        style={styles.boton}
      >
        <Ionicons name="calendar-outline" size={20} color={colors.icon} />
        <Text style={styles.botonTexto}>{texto}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </Pressable>
      <Modal
        visible={abierto}
        transparent
        animationType="slide"
        onRequestClose={() => setAbierto(false)}
      >
        <Calendario
          inicial={valor}
          minimo={minimo}
          maximo={maximo}
          rangoDesde={rangoDesde}
          onElegir={(iso) => {
            onCambiar(iso);
            setAbierto(false);
          }}
          onCerrar={() => setAbierto(false)}
        />
      </Modal>
    </>
  );
}

function Calendario({
  inicial,
  minimo,
  maximo,
  rangoDesde,
  onElegir,
  onCerrar,
}: {
  inicial: string;
  /** Primer día que se puede elegir (los anteriores salen bloqueados y no se llega a meses anteriores). */
  minimo?: string;
  /** Último día que se puede elegir. */
  maximo?: string;
  /** Resalta los días de `rangoDesde` a `inicial`. */
  rangoDesde?: string;
  onElegir: (iso: string) => void;
  onCerrar: () => void;
}) {
  const insets = useSafeAreaInsets();
  // Primer día del mes que se ve. Las semanas (de lunes a domingo) salen de lib/calendario/rejilla.ts.
  const [mes, setMes] = useState(primeroDelMes(inicial));
  const hoy = hoyISO();
  const sinFlechaAtras = !!minimo && mes.slice(0, 7) <= minimo.slice(0, 7);
  const sinFlechaAdelante = !!maximo && mes.slice(0, 7) >= maximo.slice(0, 7);
  const semanas = semanasDelMes(mes);

  return (
    <View style={styles.fondo}>
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityLabel="Cerrar"
        onPress={onCerrar}
      />
      <View
        style={[styles.hoja, { paddingBottom: insets.bottom + 20 }]}
        accessibilityViewIsModal
      >
        <View style={styles.asa} />
        <View style={styles.cabecera}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mes anterior"
            accessibilityState={{ disabled: sinFlechaAtras }}
            disabled={sinFlechaAtras}
            onPress={() => setMes(moverMes(mes, -1))}
            style={[styles.flecha, sinFlechaAtras && { opacity: 0.3 }]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.mes}>
            {etiquetaMes(mes)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mes siguiente"
            accessibilityState={{ disabled: sinFlechaAdelante }}
            disabled={sinFlechaAdelante}
            onPress={() => setMes(moverMes(mes, 1))}
            style={[styles.flecha, sinFlechaAdelante && { opacity: 0.3 }]}
          >
            <Ionicons name="chevron-forward" size={22} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.semana}>
          {INICIALES_SEMANA.map((d, i) => (
            <Text
              key={d}
              style={[styles.inicial, i === 6 && styles.domingo]}
              importantForAccessibility="no"
            >
              {d}
            </Text>
          ))}
        </View>
        <View>
          {semanas.map((sem) => (
            <View key={sem[0]} style={styles.fila}>
              {sem.map((iso) => {
                // Los días de los meses vecinos que completan la semana se dejan en blanco.
                if (iso.slice(0, 7) !== mes.slice(0, 7))
                  return <View key={iso} style={styles.celda} />;
                const bloqueado =
                  (!!minimo && iso < minimo) || (!!maximo && iso > maximo);
                const elegido = iso === inicial;
                const origen = iso === rangoDesde;
                const enRango =
                  !!rangoDesde && iso > rangoDesde && iso < inicial;
                return (
                  <Pressable
                    key={iso}
                    accessibilityRole="button"
                    accessibilityLabel={`${fechaLarga(iso)}${origen ? ", primer día" : ""}`}
                    accessibilityState={{
                      selected: elegido,
                      disabled: bloqueado,
                    }}
                    disabled={bloqueado}
                    onPress={() => onElegir(iso)}
                    style={[
                      styles.celda,
                      (enRango || origen) && styles.celdaRango,
                    ]}
                  >
                    <View
                      style={[
                        styles.dia,
                        elegido && styles.diaElegido,
                        (iso === hoy || origen) && !elegido && styles.diaHoy,
                      ]}
                    >
                      <Text
                        style={[
                          styles.diaTexto,
                          esDomingo(iso) && styles.domingo,
                          elegido && { color: colors.white },
                          bloqueado && !origen && { color: colors.inputBorder },
                        ]}
                      >
                        {deISO(iso).getDate()}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(42, 38, 39, 0.45)",
  },
  hoja: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
  },
  asa: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.inputBorder,
  },
  cabecera: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  flecha: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  mes: { fontFamily: fonts.title, fontSize: 20, color: colors.text },
  semana: { flexDirection: "row" },
  inicial: {
    flex: 1,
    textAlign: "center",
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.textSecondary,
  },
  fila: { flexDirection: "row" },
  domingo: { color: colors.accent },
  celda: {
    flex: 1,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  dia: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  diaElegido: { backgroundColor: colors.accent },
  diaHoy: { borderWidth: 1.5, borderColor: colors.accent },
  diaTexto: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  celdaRango: { backgroundColor: colors.accentSoft },
  boton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.white,
  },
  botonTexto: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.text,
  },
});
