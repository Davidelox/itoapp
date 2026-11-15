import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORES_PERSONA, type ColorPersona, colors, fonts, personColors } from '@/constants/theme';

type Props = {
  valor: ColorPersona | null;
  onCambiar: (color: ColorPersona) => void;
  /** Colores ya elegidos por la otra persona, con su nombre («David»). */
  ocupados?: Partial<Record<ColorPersona, string>>;
  /** Letra que se ve dentro de cada color (la inicial del nombre). */
  inicial: string;
};

/** Seis colores en un radiogroup. El de la otra persona queda desactivado con «Lo usa David». */
export function SelectorColor({ valor, onCambiar, ocupados = {}, inicial }: Props) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Tu color" style={styles.fila}>
      {COLORES_PERSONA.map((c) => {
        const paleta = personColors[c];
        const usadoPor = ocupados[c];
        const elegido = valor === c;
        return (
          <Pressable
            key={c}
            accessibilityRole="radio"
            accessibilityLabel={usadoPor ? `${paleta.nombre}, lo usa ${usadoPor}` : paleta.nombre}
            accessibilityState={{ checked: elegido, disabled: !!usadoPor }}
            disabled={!!usadoPor}
            onPress={() => onCambiar(c)}
            style={styles.celda}
          >
            <View
              style={[
                styles.circulo,
                { backgroundColor: paleta.bg },
                elegido && { borderColor: paleta.ink, borderWidth: 3 },
                !!usadoPor && styles.ocupado,
              ]}
            >
              <Text style={[styles.letra, { color: paleta.ink }]}>{inicial}</Text>
            </View>
            {usadoPor ? <Text style={styles.nota}>Lo usa {usadoPor}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  celda: { minWidth: 56, minHeight: 56, alignItems: 'center', gap: 4 },
  circulo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ocupado: { opacity: 0.35 },
  letra: { fontFamily: fonts.titleBold, fontSize: 22 },
  nota: { fontFamily: fonts.body, fontSize: 11, color: colors.textSecondary },
});
