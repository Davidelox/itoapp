import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Marcador } from '@/components/calendario/Marcador';
import { colors, fonts } from '@/constants/theme';
import { type Elemento, puntosDelDia } from '@/lib/calendario/agrupar';
import { type ColoresHuecos, marcador } from '@/lib/calendario/colores';
import { numeroDia } from '@/lib/calendario/rejilla';

/** Texto de los días de otros meses: más suave que el secundario, pero con contraste suficiente sobre blanco. */
const ATENUADO = '#77706C';

export const ALTO_CELDA = 46;
/** Lo que crece la fila de una semana por cada carril de barras (6 px de barra y 2 de separación). */
export const ALTO_CARRIL = 8;
/** Dónde empieza el primer carril: bajo el número del día. */
export const INICIO_CARRILES = 30;

/**
 * Un día de la rejilla del Mes: número (hoy en granate), un espacio para las barras de varios días (las pinta
 * la fila de la semana), marcadores de lo de un día, «+» y candado si hay un secreto. `elementos`: todo lo que
 * cae en el día (también lo de varios días, que cuenta para el candado). `ocultos`: barras que no cabían en los
 * carriles y pasan al «+».
 */
export function CeldaDia({
  iso,
  etiqueta,
  elementos,
  colores,
  esHoy,
  seleccionado,
  atenuado = false,
  alto = ALTO_CELDA,
  espacioBarras = 0,
  ocultos = 0,
  onPress,
}: {
  iso: string;
  /** Etiqueta de accesibilidad: «14 de noviembre: Viaje a Roma, día 2 de 5; 2 eventos». */
  etiqueta: string;
  elementos: Elemento[];
  colores: ColoresHuecos;
  esHoy: boolean;
  seleccionado: boolean;
  atenuado?: boolean;
  alto?: number;
  /** Alto reservado a las barras (carriles usados × `ALTO_CARRIL`). */
  espacioBarras?: number;
  ocultos?: number;
  onPress: (iso: string) => void;
}) {
  const { puntos, mas, secreto } = puntosDelDia(elementos);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ selected: seleccionado }}
      onPress={() => onPress(iso)}
      style={[styles.celda, { height: alto + espacioBarras }, seleccionado && styles.celdaSeleccionada]}
    >
      <View style={[styles.numero, esHoy && styles.numeroHoy]}>
        <Text style={[styles.numeroTexto, atenuado && styles.atenuado, esHoy && styles.numeroTextoHoy]}>{numeroDia(iso)}</Text>
      </View>
      {espacioBarras > 0 ? <View style={{ height: espacioBarras }} /> : null}
      <View style={styles.puntos} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {puntos.map((e) => {
          const m = marcador(e, colores.m1, colores.m2);
          return <Marcador key={e.clave} marcador={m} tamano={m.forma === 'anillo' ? 12 : 6} atenuado={atenuado} />;
        })}
        {mas || ocultos > 0 ? <Text style={styles.mas}>+</Text> : null}
        {secreto ? <Ionicons name="lock-closed" size={10} color={colors.textSecondary} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  celda: { flex: 1, alignItems: 'center', paddingTop: 3, borderRadius: 10, gap: 1 },
  celdaSeleccionada: { backgroundColor: colors.accentSoft },
  numero: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  numeroHoy: { backgroundColor: colors.accent },
  numeroTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  numeroTextoHoy: { color: colors.white },
  atenuado: { fontFamily: fonts.body, color: ATENUADO },
  puntos: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, height: 12 },
  mas: { fontFamily: fonts.bodyBold, fontSize: 11, lineHeight: 12, color: colors.textSecondary },
});
