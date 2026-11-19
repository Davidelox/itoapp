import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type SharedValue, useReducedMotion } from 'react-native-reanimated';

import { Cinta } from '@/components/calendario/Cinta';
import { ALTO_CARRIL, CeldaDia, INICIO_CARRILES } from '@/components/calendario/CeldaDia';
import { colors, fonts } from '@/constants/theme';
import { type Elemento, etiquetaDia } from '@/lib/calendario/agrupar';
import { carrilesUsados, segmentosSemana, type SegmentoBarra } from '@/lib/calendario/carriles';
import { type ColoresHuecos, colorBarra } from '@/lib/calendario/colores';
import { INICIALES_SEMANA, tramoFueraDeMes } from '@/lib/calendario/rejilla';

/** Barras de varios días por semana en el Mes (la Semana, que tiene más sitio, usa 3). */
export const CARRILES_MES = 2;
const ALTO_BARRA = 8;

/**
 * Rejilla del mes, de lunes a domingo. Los días de otros meses salen atenuados y con fondo gris. Los eventos de varios días
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
  arrastre,
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
  /** 1 mientras se desliza la rejilla para cambiar de periodo: apaga el feedback de pulsación. */
  arrastre: SharedValue<number>;
  onDia: (iso: string) => void;
}) {
  const reducida = useReducedMotion();
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
        <View pointerEvents="none" style={[styles.finde, styles.findeArriba]} />
        {INICIALES_SEMANA.map((l, i) => (
          <Text key={i} style={styles.inicial}>
            {l}
          </Text>
        ))}
      </View>
      {semanas.map((semana, indice) => {
        const { segmentos, ocultosPorDia } = segmentosSemana(semana, elementos, CARRILES_MES);
        const espacio = carrilesUsados(segmentos) * ALTO_CARRIL;
        return (
          <View key={semana[0]} style={styles.fila}>
            {/* Tinte del fin de semana (sábado y domingo): primero, para quedar debajo de las celdas. */}
            <View pointerEvents="none" style={[styles.finde, indice === semanas.length - 1 && styles.findeAbajo]} />
            {/* Gris de los días de otros meses: pintado por fila (no por celda, que tienen esquinas), encima del tinte de
                fin de semana y debajo de las celdas. */}
            <FueraDeMes tramo={tramoFueraDeMes(semana, mes)} ultima={indice === semanas.length - 1} />
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
                arrastre={arrastre}
                reducida={reducida}
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

/** Franja gris de los días de otros meses de una semana; llega al borde de la tarjeta donde toca el borde. */
function FueraDeMes({ tramo, ultima }: { tramo: { desde: number; hasta: number } | null; ultima: boolean }) {
  if (!tramo) return null;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.fueraDeMes,
        {
          left: tramo.desde === 0 ? -6 : `${(tramo.desde / 7) * 100}%`,
          right: tramo.hasta === 6 ? -6 : `${((6 - tramo.hasta) / 7) * 100}%`,
        },
        ultima && styles.findeAbajo,
      ]}
    />
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
  // `overflow: hidden` recorta el tinte del fin de semana con las esquinas redondeadas de la tarjeta.
  caja: { ...estilosCaja, gap: 0, overflow: 'hidden' },
  fila: { flexDirection: 'row' },
  inicial: { flex: 1, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textSecondary, paddingBottom: 4 },
  // Cuadrícula con dos pesos: una línea de 1 px entre semanas (se lee por semanas) y entre columnas una fina, más suave.
  lineaH: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: colors.border },
  lineaV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: colors.divider },
  // Las dos últimas columnas de siete (sábado y domingo): 5/7 desde la izquierda.
  // `right: -6` llega al borde de la tarjeta (el padding horizontal de `estilosCaja`); arriba y abajo, `-8` (su padding vertical).
  finde: { position: 'absolute', top: 0, bottom: 0, left: '71.4286%', right: -6, backgroundColor: colors.finde },
  fueraDeMes: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.fueraDeMes },
  findeArriba: { top: -8 },
  findeAbajo: { bottom: -8 },
});
