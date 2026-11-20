import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { type SharedValue } from 'react-native-reanimated';

import { Marcador, OPACIDAD_ATENUADO } from '@/components/calendario/Marcador';
import { colors, fonts } from '@/constants/theme';
import { type Elemento, puntosDelDia } from '@/lib/calendario/agrupar';
import { type ColoresHuecos, marcador } from '@/lib/calendario/colores';
import { ZONA_MINIMA, disposicionGlifos } from '@/lib/calendario/disposicion';
import { RETRASO_PULSACION, usePulsacion } from '@/components/calendario/usePulsacion';
import { numeroDia } from '@/lib/calendario/rejilla';

/** Alto de una celda sin barras: número (22 px) y debajo 32 px libres, donde se centra el bloque de glifos. */
export const ALTO_CELDA = 54;
/** Lo que crece la fila de una semana por cada carril de barras (8 px de barra y 2 de separación). */
export const ALTO_CARRIL = 10;
/** Dónde empieza el primer carril: bajo el número del día. */
export const INICIO_CARRILES = 22;
/** Alto de la zona libre bajo el número (y las barras, que la hacen 1 px menor por el hueco extra): 32 − 1 = 31 px. */
const ALTO_ZONA = ALTO_CELDA - INICIO_CARRILES - 1;

/**
 * Un día de la rejilla del Mes: número (hoy en granate), un espacio para las barras de varios días (las pinta
 * la fila de la semana), glifos de lo de un día, y en las esquinas de arriba un regalo (cumpleaños, con un «+» si
 * hay más de uno) a la izquierda y un candado (secreto) a la derecha. Los glifos van separados, sin tocarse, tan
 * grandes como quepan según cuántos haya (`lib/calendario/disposicion.ts`); con más de 2 se ven 2 y un «+N»
 * pequeño. Los cumpleaños no cuentan como glifos: solo viven en su esquina. `elementos`: todo lo que
 * cae en el día (también lo de varios días, que cuenta para el candado). `ocultos`: barras que no cabían en los
 * carriles y suman al «+N». `ancho`: ancho de la celda en px (lo mide la rejilla; sin él, el de un móvil estrecho).
 * Al pulsarla, un tinte granate suave aparece con fundido (también sobre el día seleccionado) y el contenido se
 * queda sin escalar (el texto escalado se ve borroso en iOS); el fondo de seleccionado entra con fundido.
 * `arrastre` (1 mientras se desliza la rejilla) apaga ese feedback; `reducida` quita las transiciones.
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
  ancho,
  arrastre,
  reducida,
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
  ancho?: number;
  arrastre: SharedValue<number>;
  reducida: boolean;
  onPress: (iso: string) => void;
}) {
  const { puntos, restantes, secreto, cumples } = puntosDelDia(elementos, ocultos);
  const d = disposicionGlifos(puntos.length, restantes > 0, { ancho: ancho ?? ZONA_MINIMA.ancho, alto: ALTO_ZONA });
  const { handlers, estiloTinte } = usePulsacion({ arrastre });
  const tocar = () => onPress(iso);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ selected: seleccionado }}
      onPress={tocar}
      onPressIn={handlers.onPressIn}
      onPressOut={handlers.onPressOut}
      unstable_pressDelay={RETRASO_PULSACION}
      style={[styles.celda, { height: alto + espacioBarras }]}
    >
      {/* Fondo de seleccionado (con fundido) y tinte de pulsado: debajo del contenido, con las esquinas de la celda. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.capa, styles.fondoSeleccionado, { opacity: seleccionado ? 1 : 0, transitionProperty: 'opacity', transitionDuration: reducida ? 0 : 180 }]}
      />
      <Animated.View pointerEvents="none" style={[styles.capa, styles.pulsado, estiloTinte]} />
      <View style={styles.contenido}>
        <View style={[styles.numero, esHoy && styles.numeroHoy]}>
          <Text style={[styles.numeroTexto, atenuado && styles.atenuado, esHoy && styles.numeroTextoHoy]}>{numeroDia(iso)}</Text>
        </View>
        {espacioBarras > 0 ? <View style={{ height: espacioBarras }} /> : null}
        {/* Zona libre bajo el número y las barras: el bloque de glifos va centrado en ella, en horizontal y en vertical. */}
        <View style={styles.zona}>
          <View style={{ width: d.ancho, height: d.alto }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {puntos.map((e, i) => {
              const h = d.huecos[i];
              if (!h) return null;
              return (
                <View key={e.clave} style={{ position: 'absolute', left: h.x, top: h.y }}>
                  <Marcador marcador={marcador(e, colores.m1, colores.m2)} tamano={h.tamano} atenuado={atenuado} />
                </View>
              );
            })}
            {d.mas ? (
              <View style={[styles.mas, { left: d.mas.x, top: d.mas.y, width: d.mas.ancho, height: d.mas.alto }]}>
                <Text style={styles.masTexto} numberOfLines={1} allowFontScaling={false}>
                  +{restantes}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        {cumples > 0 ? (
          <View style={styles.regalo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Ionicons name="gift" size={11} color={colors.cumpleMarca} style={atenuado && styles.esquinaAtenuada} />
            {cumples > 1 ? <Text style={[styles.regaloMas, atenuado && styles.esquinaAtenuada]}>+</Text> : null}
          </View>
        ) : null}
        {secreto ? (
          <View style={styles.candado} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Ionicons name="lock-closed" size={10} color={colors.textSecondary} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  celda: { flex: 1, borderRadius: 10 },
  // Todo el contenido de la celda; las capas de fondo van aparte, a su espalda.
  contenido: { flex: 1, alignSelf: 'stretch', alignItems: 'center', paddingTop: 2 },
  capa: { ...StyleSheet.absoluteFill, borderRadius: 10 },
  fondoSeleccionado: { backgroundColor: colors.accentSoft },
  numero: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  numeroHoy: { backgroundColor: colors.accent },
  numeroTexto: { fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 16, color: colors.text },
  numeroTextoHoy: { color: colors.white },
  atenuado: { fontFamily: fonts.body, color: colors.diaAtenuado },
  pulsado: { backgroundColor: colors.pressed },
  // Ocupa el alto que queda bajo el número (y las barras) y centra el bloque de glifos.
  zona: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  // El «+N» va en su caja del bloque (a la derecha de un glifo o debajo de dos), centrado.
  mas: { position: 'absolute', alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  masTexto: { fontFamily: fonts.bodyBold, fontSize: 9, lineHeight: 10, color: colors.textSecondary },
  candado: { position: 'absolute', top: 4, right: 3 },
  // Regalo del cumpleaños en la esquina de arriba a la izquierda (como el candado, que va a la derecha); el «+» de
  // «más de uno» sube a su esquina de arriba a la derecha, por encima del número.
  regalo: { position: 'absolute', top: 3, left: 2, width: 17, height: 14 },
  regaloMas: { position: 'absolute', top: -4, left: 10, fontFamily: fonts.bodyBold, fontSize: 10, lineHeight: 11, color: colors.cumpleMarca },
  esquinaAtenuada: { opacity: OPACIDAD_ATENUADO },
});
