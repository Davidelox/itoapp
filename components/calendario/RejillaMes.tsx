import { StyleSheet, Text, View } from 'react-native';

import { ALTO_CARRIL, CeldaDia, INICIO_CARRILES } from '@/components/calendario/CeldaDia';
import { colors, fonts } from '@/constants/theme';
import { type Elemento, etiquetaDia } from '@/lib/calendario/agrupar';
import { carrilesUsados, segmentosSemana, type SegmentoBarra } from '@/lib/calendario/carriles';
import { type ColoresHuecos, colorBarra } from '@/lib/calendario/colores';
import { INICIALES_SEMANA } from '@/lib/calendario/rejilla';

/** Barras de varios días por semana en el Mes (la Semana, que tiene más sitio, usa 3). */
export const CARRILES_MES = 2;
const ALTO_BARRA = 6;

/**
 * Rejilla del mes, de lunes a domingo. Los días de otros meses salen atenuados. Los eventos de varios días
 * se dibujan como barras de 6 px sobre las celdas, partidas por semana; el resto, como marcadores.
 */
export function RejillaMes({
  semanas,
  mes,
  hoy,
  seleccionado,
  porDia,
  elementos,
  colores,
  onDia,
}: {
  semanas: string[][];
  /** `YYYY-MM` del mes que se está viendo. */
  mes: string;
  hoy: string;
  seleccionado: string | null;
  /** Elementos por día, con los de varios días repartidos por sus días. */
  porDia: Record<string, Elemento[]>;
  /** Un elemento por repetición (sin repartir): de aquí salen las barras. */
  elementos: Elemento[];
  colores: ColoresHuecos;
  onDia: (iso: string) => void;
}) {
  return (
    <View style={styles.caja}>
      <View style={styles.fila} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {INICIALES_SEMANA.map((l, i) => (
          <Text key={i} style={styles.inicial}>
            {l}
          </Text>
        ))}
      </View>
      {semanas.map((semana) => {
        const { segmentos, ocultosPorDia } = segmentosSemana(semana, elementos, CARRILES_MES);
        const espacio = carrilesUsados(segmentos) * ALTO_CARRIL;
        return (
          <View key={semana[0]} style={styles.fila}>
            {semana.map((iso) => (
              <CeldaDia
                key={iso}
                iso={iso}
                etiqueta={etiquetaDia(iso, porDia[iso] ?? [], hoy)}
                elementos={porDia[iso] ?? []}
                colores={colores}
                esHoy={iso === hoy}
                seleccionado={iso === seleccionado}
                atenuado={iso.slice(0, 7) !== mes}
                espacioBarras={espacio}
                ocultos={ocultosPorDia[iso] ?? 0}
                onPress={onDia}
              />
            ))}
            {/* Las barras no se tocan: se toca la celda. */}
            <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {segmentos.map((s) => (
                <Barra key={s.clave} segmento={s} colores={colores} />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Una barra horizontal: persona = su color; los dos = cinta bicolor (3 px m1 arriba, 3 px m2 abajo). Extremos redondeados solo donde empieza o acaba. */
function Barra({ segmento: s, colores }: { segmento: SegmentoBarra; colores: ColoresHuecos }) {
  const { color, color2 } = colorBarra(s.elemento, colores.m1, colores.m2);
  const columnas = s.colFin - s.colInicio + 1;
  return (
    <View
      style={{
        position: 'absolute',
        top: INICIO_CARRILES + s.carril * ALTO_CARRIL,
        left: `${(s.colInicio / 7) * 100}%`,
        width: `${(columnas / 7) * 100}%`,
        height: ALTO_BARRA,
        // Con margen donde empieza o acaba (se ve el hueco entre días); pegada al borde donde sigue en otra fila.
        paddingLeft: s.empieza ? 3 : 0,
        paddingRight: s.termina ? 3 : 0,
      }}
    >
      <View
        style={{
          flex: 1,
          overflow: 'hidden',
          borderTopLeftRadius: s.empieza ? ALTO_BARRA / 2 : 0,
          borderBottomLeftRadius: s.empieza ? ALTO_BARRA / 2 : 0,
          borderTopRightRadius: s.termina ? ALTO_BARRA / 2 : 0,
          borderBottomRightRadius: s.termina ? ALTO_BARRA / 2 : 0,
          backgroundColor: color,
        }}
      >
        {color2 ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: ALTO_BARRA / 2, backgroundColor: color2 }} /> : null}
      </View>
    </View>
  );
}

export const estilosCaja = {
  backgroundColor: colors.white,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 20,
  paddingVertical: 8,
  paddingHorizontal: 6,
  gap: 2,
} as const;

const styles = StyleSheet.create({
  caja: estilosCaja,
  fila: { flexDirection: 'row' },
  inicial: { flex: 1, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textSecondary, paddingBottom: 2 },
});
