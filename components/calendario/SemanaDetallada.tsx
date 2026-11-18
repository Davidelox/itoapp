import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Cinta } from '@/components/calendario/Cinta';
import { estilosCaja } from '@/components/calendario/RejillaMes';
import { ALTO_LINEA, LineaSemana } from '@/components/calendario/LineaSemana';
import { colors, fonts } from '@/constants/theme';
import type { ContextoLinea, Elemento } from '@/lib/calendario/agrupar';
import { type ColoresHuecos, colorBarra, marcador } from '@/lib/calendario/colores';
import type { SegmentoBarra } from '@/lib/calendario/carriles';
import { abreviaturaDia, numeroDia } from '@/lib/calendario/rejilla';
import { type FilaDia, MAX_CARRILES_SEMANA, MAX_LINEAS_SEMANA, barrasDeColumna, filasSemana, lineaSemana } from '@/lib/calendario/semana';

const ANCHO_DIA = 48;
const ANCHO_BARRA = 8;
const SEPARACION_BARRAS = 4;
const ANCHO_CARRILES = MAX_CARRILES_SEMANA * ANCHO_BARRA + (MAX_CARRILES_SEMANA - 1) * SEPARACION_BARRAS;

/**
 * Modo Semana (docs/plan-calendario-v2.md §2.6): una fila por día con hasta 3 líneas, y los eventos de varios
 * días como barras verticales continuas en la columna de carriles. Cada fila pinta su trozo de la barra a todo
 * lo alto, así que las barras no se cortan entre filas aunque midan distinto y no hace falta medir nada.
 * Tocar el número del día (o un hueco de la fila) lo selecciona; tocar una línea abre su detalle. Mientras se
 * mantiene pulsado el día o el hueco, toda la fila se tiñe de granate suave (también si es la seleccionada); las
 * líneas y el «+N más» tienen su propio feedback.
 */
export function SemanaDetallada({
  dias,
  hoy,
  seleccionado,
  elementos,
  colores,
  contexto,
  onDia,
  onLinea,
}: {
  dias: string[];
  hoy: string;
  seleccionado: string | null;
  /** Un elemento por repetición (sin repartir por días), ya filtrado. */
  elementos: Elemento[];
  colores: ColoresHuecos;
  contexto: ContextoLinea;
  onDia: (iso: string) => void;
  /** Abre el detalle de la línea tocada (el evento o el pago). */
  onLinea: (e: Elemento) => void;
}) {
  const { filas, segmentos } = filasSemana(dias, elementos, { hoy, maxLineas: MAX_LINEAS_SEMANA, maxCarriles: MAX_CARRILES_SEMANA });
  return (
    <View style={styles.caja}>
      {filas.map((fila, col) => {
        const esHoy = fila.iso === hoy;
        const elegido = fila.iso === seleccionado;
        const barras = barrasDeColumna(segmentos, col);
        return (
          <FilaDelDia
            key={fila.iso}
            fila={fila}
            elegido={elegido}
            esHoy={esHoy}
            ultima={col === dias.length - 1}
            carriles={barras.map((s) => (
              <BarraVertical key={s.clave} segmento={s} fila={col} colores={colores} />
            ))}
            lineas={fila.lineas.map((l, i) => (
              <LineaSemana
                key={l.clave}
                arriba={i === 0}
                abajo={i === fila.lineas.length - 1 && fila.mas === 0}
                partes={lineaSemana(l, contexto)}
                marcador={marcador(l.elemento, colores.m1, colores.m2)}
                onPress={() => onLinea(l.elemento)}
              />
            ))}
            onDia={onDia}
          />
        );
      })}
    </View>
  );
}

/** Una fila de la Semana. Guarda si se está pulsando el día o el hueco, para teñir toda la fila a la vez. */
function FilaDelDia({
  fila,
  elegido,
  esHoy,
  ultima,
  carriles,
  lineas,
  onDia,
}: {
  fila: FilaDia;
  elegido: boolean;
  esHoy: boolean;
  ultima: boolean;
  carriles: ReactNode;
  lineas: ReactNode;
  onDia: (iso: string) => void;
}) {
  const [pulsado, setPulsado] = useState(false);
  const pulsar = { onPressIn: () => setPulsado(true), onPressOut: () => setPulsado(false) };
  return (
    <View style={[styles.fila, elegido && styles.filaElegida]}>
      {/* Tinte de pulsado: debajo de todo (barras, líneas y separador), sobre el fondo de la fila. */}
      {pulsado ? <View pointerEvents="none" style={styles.pulsado} /> : null}
      {!ultima ? <View style={styles.separador} /> : null}
      {elegido ? <View style={styles.borde} /> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={fila.etiqueta}
        accessibilityState={{ selected: elegido }}
        onPress={() => onDia(fila.iso)}
        {...pulsar}
        style={styles.dia}
      >
        <Text style={[styles.diaSemana, esHoy && styles.diaSemanaHoy]}>{abreviaturaDia(fila.iso).toUpperCase()}</Text>
        <View style={[styles.numero, esHoy && styles.numeroHoy]}>
          <Text style={[styles.numeroTexto, esHoy && styles.numeroTextoHoy]}>{numeroDia(fila.iso)}</Text>
        </View>
      </Pressable>

      <View style={styles.carriles} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {carriles}
      </View>

      {/* Un hueco de la fila selecciona el día; las líneas son sus propios botones. */}
      <Pressable accessible={false} onPress={() => onDia(fila.iso)} {...pulsar} style={styles.elementos}>
        {lineas}
        {fila.mas > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${fila.mas} más. Toca para ver el día`}
            hitSlop={{ bottom: 6 }}
            onPress={() => onDia(fila.iso)}
            style={({ pressed }) => [styles.mas, pressed && styles.masPulsado]}
          >
            <Text style={styles.masTexto}>+{fila.mas} más</Text>
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
}

/**
 * El trozo de una barra vertical en una fila. Continúa por arriba y por abajo (a todo lo alto) salvo donde el
 * evento empieza o acaba, que se redondea y deja un margen.
 */
function BarraVertical({ segmento: s, fila, colores }: { segmento: SegmentoBarra; fila: number; colores: ColoresHuecos }) {
  const arriba = s.empieza && fila === s.colInicio;
  const abajo = s.termina && fila === s.colFin;
  return (
    <View
      style={{
        position: 'absolute',
        left: s.carril * (ANCHO_BARRA + SEPARACION_BARRAS),
        width: ANCHO_BARRA,
        top: arriba ? 8 : 0,
        bottom: abajo ? 8 : 0,
      }}
    >
      {/* Los dos: cinta partida a lo largo, m1 a la izquierda y m2 a la derecha. */}
      <Cinta color={colorBarra(s.elemento, colores.m1, colores.m2)} grosor={ANCHO_BARRA} vertical inicio={arriba} fin={abajo} />
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { ...estilosCaja, paddingHorizontal: 0, paddingVertical: 0, gap: 0, overflow: 'hidden' },
  fila: { flexDirection: 'row', minHeight: 56 },
  filaElegida: { backgroundColor: colors.accentSoft },
  // El separador va debajo de las barras: estas, al ser de las filas siguientes, lo tapan y se ven continuas.
  separador: { position: 'absolute', left: 12, right: 0, bottom: 0, height: 1, backgroundColor: colors.divider },
  pulsado: { ...StyleSheet.absoluteFill, backgroundColor: colors.pressed },
  borde: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: colors.accent },
  dia: { width: ANCHO_DIA, alignItems: 'center', justifyContent: 'center', paddingLeft: 3, gap: 1 },
  diaSemana: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textSecondary },
  diaSemanaHoy: { color: colors.accent },
  numero: { minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  numeroHoy: { backgroundColor: colors.accent },
  numeroTexto: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text },
  numeroTextoHoy: { color: colors.white, fontSize: 16 },
  carriles: { width: ANCHO_CARRILES, marginRight: 6 },
  elementos: { flex: 1, minWidth: 0, justifyContent: 'center', paddingVertical: 4, paddingRight: 12 },
  mas: { height: ALTO_LINEA, justifyContent: 'center', paddingLeft: 18, borderRadius: 8 },
  masPulsado: { backgroundColor: colors.pressed },
  masTexto: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary },
});
