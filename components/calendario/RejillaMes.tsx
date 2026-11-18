import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Cinta } from '@/components/calendario/Cinta';
import { ALTO_CARRIL, CeldaDia, INICIO_CARRILES } from '@/components/calendario/CeldaDia';
import { colors, fonts } from '@/constants/theme';
import { type Elemento, etiquetaDia } from '@/lib/calendario/agrupar';
import { carrilesUsados, segmentosSemana, type SegmentoBarra } from '@/lib/calendario/carriles';
import { type ColoresHuecos, colorBarra } from '@/lib/calendario/colores';
import { INICIALES_SEMANA } from '@/lib/calendario/rejilla';

/** Barras de varios días por semana en el Mes (la Semana, que tiene más sitio, usa 3). */
export const CARRILES_MES = 2;
const ALTO_BARRA = 8;

/**
 * Rejilla del mes, de lunes a domingo. Los días de otros meses salen atenuados. Los eventos de varios días
 * se dibujan como barras de 8 px (relleno pastel y contorno oscuro) sobre las celdas, partidas por semana; el resto, como glifos
 * separados, y los cumpleaños, como un regalo en la esquina.
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
  // Ancho de una celda: se mide en la fila de las iniciales (siete celdas justas) para que los glifos sean lo más
  // grandes que caben en este móvil. Hasta entonces, el de un móvil estrecho.
  const [ancho, setAncho] = useState<number | undefined>();
  return (
    <View style={styles.caja}>
      <View
        style={styles.fila}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onLayout={(ev) => {
          // Un ancho 0 (primer layout sin medir) no sirve: se deja el valor por defecto.
          const medido = Math.floor(ev.nativeEvent.layout.width / 7);
          if (medido > 0) setAncho(medido);
        }}
      >
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
                ancho={ancho}
                onPress={onDia}
              />
            ))}
            {/* Las barras y las líneas de la cuadrícula no se tocan: se toca la celda. Las líneas van debajo de las barras. */}
            <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={styles.lineaH} />
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <View key={i} style={[styles.lineaV, { left: `${(i / 7) * 100}%` }]} />
              ))}
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

/** Una barra horizontal: persona = su color; los dos = cinta bicolor (4 px m1 arriba, 4 px m2 abajo). Extremos redondeados solo donde empieza o acaba. */
function Barra({ segmento: s, colores }: { segmento: SegmentoBarra; colores: ColoresHuecos }) {
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
      <Cinta color={colorBarra(s.elemento, colores.m1, colores.m2)} grosor={ALTO_BARRA} inicio={s.empieza} fin={s.termina} />
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
  // Sin `gap`: las filas van pegadas y las separa la cuadrícula.
  caja: { ...estilosCaja, gap: 0 },
  fila: { flexDirection: 'row' },
  inicial: { flex: 1, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textSecondary, paddingBottom: 4 },
  // Cuadrícula sutil: una línea fina arriba de cada semana y otra entre columnas; al cruzarse no se engrosan (mismo color opaco).
  lineaH: { position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  lineaV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
