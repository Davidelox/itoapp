import { Pressable, StyleSheet, Text, View } from 'react-native';

import { estilosCaja } from '@/components/calendario/RejillaMes';
import { ALTO_LINEA, LineaSemana } from '@/components/calendario/LineaSemana';
import { colors, fonts } from '@/constants/theme';
import type { ContextoLinea, Elemento } from '@/lib/calendario/agrupar';
import { type ColoresHuecos, colorBarra, marcador } from '@/lib/calendario/colores';
import type { SegmentoBarra } from '@/lib/calendario/carriles';
import { abreviaturaDia, numeroDia } from '@/lib/calendario/rejilla';
import { MAX_CARRILES_SEMANA, MAX_LINEAS_SEMANA, barrasDeColumna, filasSemana, lineaSemana } from '@/lib/calendario/semana';

const ANCHO_DIA = 48;
const ANCHO_BARRA = 6;
const SEPARACION_BARRAS = 4;
const ANCHO_CARRILES = MAX_CARRILES_SEMANA * ANCHO_BARRA + (MAX_CARRILES_SEMANA - 1) * SEPARACION_BARRAS;

/**
 * Modo Semana (docs/plan-calendario-v2.md §2.6): una fila por día con hasta 3 líneas, y los eventos de varios
 * días como barras verticales continuas en la columna de carriles. Cada fila pinta su trozo de la barra a todo
 * lo alto, así que las barras no se cortan entre filas aunque midan distinto y no hace falta medir nada.
 * Tocar el número del día (o un hueco de la fila) lo selecciona; tocar una línea abre su detalle.
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
          <View key={fila.iso} style={[styles.fila, elegido && styles.filaElegida]}>
            {col < dias.length - 1 ? <View style={styles.separador} /> : null}
            {elegido ? <View style={styles.borde} /> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={fila.etiqueta}
              accessibilityState={{ selected: elegido }}
              onPress={() => onDia(fila.iso)}
              style={styles.dia}
            >
              <Text style={[styles.diaSemana, esHoy && styles.diaSemanaHoy]}>{abreviaturaDia(fila.iso).toUpperCase()}</Text>
              <View style={[styles.numero, esHoy && styles.numeroHoy]}>
                <Text style={[styles.numeroTexto, esHoy && styles.numeroTextoHoy]}>{numeroDia(fila.iso)}</Text>
              </View>
            </Pressable>

            <View style={styles.carriles} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {barras.map((s) => (
                <BarraVertical key={s.clave} segmento={s} fila={col} colores={colores} />
              ))}
            </View>

            {/* Un hueco de la fila selecciona el día; las líneas son sus propios botones. */}
            <Pressable accessible={false} onPress={() => onDia(fila.iso)} style={styles.elementos}>
              {fila.lineas.map((l, i) => (
                <LineaSemana
                  key={l.clave}
                  arriba={i === 0}
                  abajo={i === fila.lineas.length - 1 && fila.mas === 0}
                  partes={lineaSemana(l, contexto)}
                  marcador={marcador(l.elemento, colores.m1, colores.m2)}
                  onPress={() => onLinea(l.elemento)}
                />
              ))}
              {fila.mas > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${fila.mas} más. Toca para ver el día`}
                  hitSlop={{ bottom: 6 }}
                  onPress={() => onDia(fila.iso)}
                  style={styles.mas}
                >
                  <Text style={styles.masTexto}>+{fila.mas} más</Text>
                </Pressable>
              ) : null}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/**
 * El trozo de una barra vertical en una fila. Continúa por arriba y por abajo (a todo lo alto) salvo donde el
 * evento empieza o acaba, que se redondea y deja un margen.
 */
function BarraVertical({ segmento: s, fila, colores }: { segmento: SegmentoBarra; fila: number; colores: ColoresHuecos }) {
  const { color, color2 } = colorBarra(s.elemento, colores.m1, colores.m2);
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
        flexDirection: 'row',
        overflow: 'hidden',
        backgroundColor: color,
        borderTopLeftRadius: arriba ? ANCHO_BARRA / 2 : 0,
        borderTopRightRadius: arriba ? ANCHO_BARRA / 2 : 0,
        borderBottomLeftRadius: abajo ? ANCHO_BARRA / 2 : 0,
        borderBottomRightRadius: abajo ? ANCHO_BARRA / 2 : 0,
      }}
    >
      {/* Los dos: cinta partida a lo largo, m1 a la izquierda y m2 a la derecha. */}
      {color2 ? <View style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: ANCHO_BARRA / 2, backgroundColor: color2 }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { ...estilosCaja, paddingHorizontal: 0, paddingVertical: 0, gap: 0, overflow: 'hidden' },
  fila: { flexDirection: 'row', minHeight: 56 },
  filaElegida: { backgroundColor: colors.accentSoft },
  // El separador va debajo de las barras: estas, al ser de las filas siguientes, lo tapan y se ven continuas.
  separador: { position: 'absolute', left: 12, right: 0, bottom: 0, height: 1, backgroundColor: colors.divider },
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
  mas: { height: ALTO_LINEA, justifyContent: 'center', paddingLeft: 18 },
  masTexto: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary },
});
