import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';

type IconoIonic = ComponentProps<typeof Ionicons>['name'];

type PropsOpcion = {
  titulo: string;
  detalle: string;
  elegida: boolean;
  onElegir: () => void;
  recomendada?: boolean;
  /** Se muestra debajo solo cuando está elegida (por ejemplo, el control del porcentaje). */
  extra?: ReactNode;
};

/** Tarjeta de una sola elección dentro de un grupo (mockup «Reparto»): círculo con check y borde granate al elegirla. */
export function OpcionRadio({ titulo, detalle, elegida, onElegir, recomendada = false, extra }: PropsOpcion) {
  const colors = useColores();
  const styles = useStyles();
  return (
    <View style={[styles.tarjeta, elegida ? styles.tarjetaElegida : styles.tarjetaNormal]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: elegida }}
        accessibilityLabel={`${titulo}${recomendada ? ', recomendado' : ''}. ${detalle}`}
        onPress={onElegir}
        style={styles.boton}
      >
        <View style={[styles.marca, elegida ? styles.marcaElegida : styles.marcaNormal]}>
          {elegida ? <Ionicons name="checkmark" size={16} color={colors.onAccent} /> : null}
        </View>
        <View style={styles.textos}>
          <View style={styles.tituloFila}>
            <Text style={styles.titulo}>{titulo}</Text>
            {recomendada ? <Text style={styles.recomendado}>Recomendado</Text> : null}
          </View>
          <Text style={styles.detalle}>{detalle}</Text>
        </View>
      </Pressable>
      {elegida && extra ? <View style={styles.extra}>{extra}</View> : null}
    </View>
  );
}

/** Grupo de opciones con su pregunta como cabecera. */
export function GrupoOpciones({ pregunta, ayuda, children }: { pregunta: string; ayuda?: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.grupo} accessibilityRole="radiogroup" accessibilityLabel={pregunta}>
      <Text accessibilityRole="header" style={styles.pregunta}>
        {pregunta}
      </Text>
      {ayuda ? <Text style={styles.ayuda}>{ayuda}</Text> : null}
      {children}
    </View>
  );
}

/**
 * Control segmentado de dos o más valores (fondo beige, la elegida en blanco). `compacto`: segmentos de 32 px de alto,
 * del ancho de su texto (14 px), para una barra de una línea; el toque llega a 44 con `hitSlop`. Con `iconos`, el
 * segmento pinta el icono de su valor en vez del texto (la etiqueta pasa a ser su `accessibilityLabel`).
 *
 * El segmento compacto NO lleva ninguna propiedad `flex*`: en Yoga (nativo) `flex: 1` junto a `flexBasis: 'auto'`
 * deja la base en 0 y, con `flexGrow: 0`, el segmento mide solo su relleno y el texto desaparece.
 */
export function Segmentado<T extends string>({
  opciones,
  valor,
  onCambiar,
  etiqueta,
  compacto = false,
  iconos,
}: {
  opciones: { valor: T; etiqueta: string }[];
  valor: T;
  onCambiar: (v: T) => void;
  etiqueta: string;
  compacto?: boolean;
  iconos?: Partial<Record<T, IconoIonic>>;
}) {
  const colors = useColores();
  const styles = useStyles();
  return (
    <View style={[styles.segmentado, compacto && styles.segmentadoCompacto]} accessibilityRole="radiogroup" accessibilityLabel={etiqueta}>
      {opciones.map((o) => {
        const activa = o.valor === valor;
        const icono = iconos?.[o.valor];
        return (
          <Pressable
            key={o.valor}
            accessibilityRole="radio"
            accessibilityState={{ checked: activa }}
            accessibilityLabel={icono ? o.etiqueta : undefined}
            onPress={() => onCambiar(o.valor)}
            hitSlop={compacto ? { top: 6, bottom: 6 } : undefined}
            style={[styles.segmento, compacto ? styles.segmentoCompacto : styles.segmentoRepartido, icono && styles.segmentoIcono, activa && styles.segmentoActivo]}
          >
            {icono ? (
              <Ionicons name={icono} size={18} color={activa ? colors.text : colors.textSecondary} />
            ) : (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={compacto ? 1.2 : undefined}
                style={[styles.segmentoTexto, compacto && styles.segmentoTextoCompacto, activa && (compacto ? styles.segmentoTextoActivoCompacto : styles.segmentoTextoActivo)]}
              >
                {o.etiqueta}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = crearEstilos((colors) => ({
  grupo: { gap: 10 },
  pregunta: { fontFamily: fonts.title, fontSize: 20, color: colors.text },
  ayuda: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.textSecondary },
  tarjeta: { backgroundColor: colors.card, borderRadius: radius.xl - 4 },
  tarjetaNormal: { borderWidth: 1, borderColor: colors.border, margin: 1 },
  tarjetaElegida: { borderWidth: 2, borderColor: colors.accent },
  boton: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44, paddingVertical: 14, paddingHorizontal: 16 },
  marca: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  marcaNormal: { borderWidth: 2, borderColor: colors.inputBorder },
  marcaElegida: { backgroundColor: colors.accent },
  textos: { flex: 1, gap: 3 },
  tituloFila: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  titulo: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  recomendado: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.full,
    paddingVertical: 3,
    paddingHorizontal: 9,
    overflow: 'hidden',
  },
  detalle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  extra: { marginLeft: 56, marginRight: 16, marginBottom: 14 },
  segmentado: { flexDirection: 'row', padding: 3, backgroundColor: colors.segmented, borderRadius: radius.full },
  segmentadoCompacto: { flexShrink: 0 },
  segmento: { minHeight: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  segmentoRepartido: { flex: 1 },
  // Sin ninguna propiedad `flex*`: el ancho es el del texto, que Yoga mide.
  segmentoCompacto: { minHeight: 32, minWidth: 52, paddingHorizontal: 12 },
  segmentoIcono: { minWidth: 40 },
  segmentoActivo: { backgroundColor: colors.card },
  segmentoTexto: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textSecondary },
  segmentoTextoCompacto: { fontSize: 14 },
  segmentoTextoActivo: { fontFamily: fonts.bodyBold, color: colors.text },
  // En compacto solo cambia el color: con otra fuente el segmento cambiaría de ancho al activarse (y lo que lo rodea bailaría).
  segmentoTextoActivoCompacto: { color: colors.text },
}));
