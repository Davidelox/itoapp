import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '@/constants/theme';

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
          {elegida ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
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

/** Control segmentado de dos o más valores (fondo beige, la elegida en blanco). */
export function Segmentado<T extends string>({
  opciones,
  valor,
  onCambiar,
  etiqueta,
}: {
  opciones: { valor: T; etiqueta: string }[];
  valor: T;
  onCambiar: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <View style={styles.segmentado} accessibilityRole="radiogroup" accessibilityLabel={etiqueta}>
      {opciones.map((o) => {
        const activa = o.valor === valor;
        return (
          <Pressable
            key={o.valor}
            accessibilityRole="radio"
            accessibilityState={{ checked: activa }}
            onPress={() => onCambiar(o.valor)}
            style={[styles.segmento, activa && styles.segmentoActivo]}
          >
            <Text style={[styles.segmentoTexto, activa && styles.segmentoTextoActivo]}>{o.etiqueta}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grupo: { gap: 10 },
  pregunta: { fontFamily: fonts.title, fontSize: 20, color: colors.text },
  ayuda: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.textSecondary },
  tarjeta: { backgroundColor: colors.white, borderRadius: radius.xl - 4 },
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
  segmento: { flex: 1, minHeight: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  segmentoActivo: { backgroundColor: colors.white },
  segmentoTexto: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textSecondary },
  segmentoTextoActivo: { fontFamily: fonts.bodyBold, color: colors.text },
});
