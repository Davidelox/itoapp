import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { type Rect, posicionMenu } from '@/lib/calendario/filtros';
import { MESES } from '@/lib/gastos/fechas';
import { type Vista, mismoPeriodo } from '@/lib/calendario/rejilla';
import { ANIO_MAX, ANIO_MIN, anclaDeMes, limitarAnio, mesesDelAnio, semanasParaElegir } from '@/lib/calendario/selectorMes';

const ANCHO_MAX = 296;
const ALTO_FILA = 44;
const GAP = 6;
const PADDING = 10;
/** Cabecera (44) + 6 filas de semana (44 cada una) + el relleno: lo más alto que llega el menú. */
export const ALTO_SELECTOR = ALTO_FILA + 6 * ALTO_FILA + 2 * PADDING;
/** El paso de meses: cabecera (44) + 4 filas de 3 meses con sus huecos + el pie de «Hoy» (44) + el relleno = 302. */
export const ALTO_SELECTOR_MESES = ALTO_FILA + (4 * ALTO_FILA + 3 * GAP) + ALTO_FILA + 2 * PADDING;

/**
 * Desplegable para saltar a otro mes (o semana) desde la barra (docs/plan-calendario-v3.md §2), anclado bajo la
 * etiqueta del periodo en un `Modal` transparente, como el menú del embudo. En Mes: año con flechas y 12 meses (un
 * toque elige y cierra). En Semana: se elige el mes y luego la semana. Su estado (año, paso) se reinicia porque
 * `BarraPeriodo` lo monta con una `key` distinta en cada apertura.
 */
export function SelectorPeriodo({
  visible,
  boton,
  vista,
  ancla,
  hoy,
  onElegir,
  onCerrar,
}: {
  visible: boolean;
  boton: Rect | null;
  vista: Vista;
  ancla: string;
  hoy: string;
  onElegir: (ancla: string) => void;
  onCerrar: () => void;
}) {
  const colors = useColores();
  const styles = useStyles();
  const ventana = useWindowDimensions();
  const [anio, setAnio] = useState(() => limitarAnio(Number(ancla.slice(0, 4))));
  const [mesElegido, setMesElegido] = useState<number | null>(null);
  if (!boton) return null;

  const ancho = Math.min(ANCHO_MAX, ventana.width - 16);
  const enSemanas = vista === 'semana' && mesElegido !== null;
  const alto = enSemanas ? ALTO_SELECTOR : ALTO_SELECTOR_MESES;
  const { top, left } = posicionMenu(boton, ventana, { ancho, alto }, 8, 'centro');
  const celda = Math.floor((ancho - 2 - 2 * PADDING - 2 * GAP) / 3);
  const elegir = (iso: string) => {
    onElegir(iso);
    onCerrar();
  };

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onCerrar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onCerrar} style={styles.fondo} />
      <View
        accessibilityViewIsModal
        onAccessibilityEscape={onCerrar}
        accessibilityLabel={vista === 'mes' ? 'Elegir mes' : 'Elegir semana'}
        style={[styles.menu, { top, left, width: ancho, height: alto }]}
      >
        {enSemanas ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver a los meses"
              onPress={() => setMesElegido(null)}
              style={({ pressed }) => [styles.cabecera, styles.cabeceraVolver, pressed && styles.pulsada]}
            >
              <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
              <Text style={styles.anio}>{`${MESES[mesElegido - 1]} ${anio}`}</Text>
            </Pressable>
            {semanasParaElegir(anio, mesElegido, ancla, hoy).map((s) => (
              <Pressable
                key={s.ancla}
                accessibilityRole="button"
                accessibilityState={{ selected: s.visible }}
                accessibilityLabel={`${s.accesible}${s.actual ? ', semana actual' : ''}`}
                onPress={() => elegir(s.ancla)}
                style={({ pressed }) => [styles.fila, s.visible && styles.visible, !s.visible && s.actual && styles.actual, pressed && !s.visible && styles.pulsada]}
              >
                <Text style={[styles.texto, s.visible && styles.textoVisible, !s.visible && s.actual && styles.textoActual]}>{s.etiqueta}</Text>
              </Pressable>
            ))}
          </>
        ) : (
          <>
            <View style={styles.cabecera}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Año anterior"
                accessibilityState={{ disabled: anio <= ANIO_MIN }}
                disabled={anio <= ANIO_MIN}
                onPress={() => setAnio(limitarAnio(anio - 1))}
                style={({ pressed }) => [styles.flecha, anio <= ANIO_MIN && styles.apagada, pressed && styles.pulsada]}
              >
                <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
              </Pressable>
              <Text accessibilityRole="header" style={styles.anio}>
                {anio}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Año siguiente"
                accessibilityState={{ disabled: anio >= ANIO_MAX }}
                disabled={anio >= ANIO_MAX}
                onPress={() => setAnio(limitarAnio(anio + 1))}
                style={({ pressed }) => [styles.flecha, anio >= ANIO_MAX && styles.apagada, pressed && styles.pulsada]}
              >
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <View style={styles.rejilla}>
              {mesesDelAnio(anio, ancla, hoy).map((m) => (
                <Pressable
                  key={m.mes}
                  accessibilityRole="button"
                  accessibilityState={{ selected: m.visible }}
                  accessibilityLabel={`${m.accesible}${m.actual ? ', mes actual' : ''}`}
                  onPress={() => (vista === 'mes' ? elegir(anclaDeMes(anio, m.mes, hoy)) : setMesElegido(m.mes))}
                  style={({ pressed }) => [
                    styles.mes,
                    { width: celda },
                    m.visible && styles.visible,
                    !m.visible && m.actual && styles.actual,
                    pressed && !m.visible && styles.pulsada,
                  ]}
                >
                  <Text style={[styles.texto, m.visible && styles.textoVisible, !m.visible && m.actual && styles.textoActual]}>{m.etiqueta}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.pie}>
              {mismoPeriodo(vista, ancla, hoy) ? null : (
                <Pressable accessibilityRole="button" onPress={() => elegir(hoy)} hitSlop={6} style={styles.hoy}>
                  <Text style={styles.hoyTexto}>Hoy</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const useStyles = crearEstilos((colors) => ({
  fondo: { ...StyleSheet.absoluteFill, backgroundColor: colors.veloSuave },
  menu: {
    position: 'absolute',
    padding: PADDING,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.sombra,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cabecera: { height: ALTO_FILA, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cabeceraVolver: { justifyContent: 'flex-start', gap: 4, borderRadius: 10 },
  flecha: { width: ALTO_FILA, height: ALTO_FILA, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  apagada: { opacity: 0.3 },
  anio: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  mes: { height: ALTO_FILA, borderRadius: 10, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  fila: { height: ALTO_FILA, borderRadius: 10, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  visible: { backgroundColor: colors.accent, borderColor: colors.accent },
  actual: { borderColor: colors.accent },
  pulsada: { backgroundColor: colors.pressed },
  texto: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  textoVisible: { fontFamily: fonts.bodyBold, color: colors.onAccent },
  textoActual: { fontFamily: fonts.bodyBold, color: colors.accent },
  pie: { height: ALTO_FILA, alignItems: 'center', justifyContent: 'center', marginTop: 'auto' },
  hoy: { minHeight: 36, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  hoyTexto: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.accent },
}));
