import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '@/constants/theme';

/** Chip redondeado: relleno oscuro cuando está elegido (mockup AnadirGasto). */
export function Chip({
  etiqueta,
  activo,
  onPress,
  rol = 'button',
}: {
  etiqueta: string;
  activo: boolean;
  onPress: () => void;
  rol?: 'button' | 'radio';
}) {
  return (
    <Pressable
      accessibilityRole={rol}
      accessibilityLabel={etiqueta}
      accessibilityState={rol === 'radio' ? { checked: activo } : { selected: activo }}
      onPress={onPress}
      style={[styles.chip, activo ? styles.chipActivo : styles.chipNormal]}
    >
      <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{etiqueta}</Text>
    </Pressable>
  );
}

/** Etiqueta pequeña de un grupo de campos («Categoría», «¿Quién pagó?»). */
export function Grupo({ etiqueta, children, rol }: { etiqueta: string; children: ReactNode; rol?: 'radiogroup' }) {
  return (
    <View style={styles.grupo} accessibilityRole={rol} accessibilityLabel={rol ? etiqueta : undefined}>
      <Text style={styles.grupoEtiqueta}>{etiqueta}</Text>
      {children}
    </View>
  );
}

export function FilaChips({ children }: { children: ReactNode }) {
  return <View style={styles.filaChips}>{children}</View>;
}

/** Barra «Tú X % · Pareja Y %» con −/+ de 5 en 5 (del 0 al 100) e importes de cada uno. */
export function BarraPorcentaje({
  pctYo,
  onCambiar,
  nombrePareja,
  importeYo,
  importePareja,
  tintaYo,
  tintaPareja,
  fondoYo,
  fondoPareja,
}: {
  pctYo: number;
  onCambiar: (p: number) => void;
  nombrePareja: string;
  importeYo: string | null;
  importePareja: string | null;
  tintaYo: string;
  tintaPareja: string;
  fondoYo: string;
  fondoPareja: string;
}) {
  const pctPareja = 100 - pctYo;
  return (
    <View style={styles.barraCaja}>
      <View style={styles.barraCabecera}>
        <Text style={styles.barraTitulo}>Porcentaje de cada uno</Text>
        <View style={styles.botones}>
          <BotonRedondo icono="remove" etiqueta="Bajar tu parte 5 %" onPress={() => onCambiar(Math.max(0, pctYo - 5))} />
          <BotonRedondo icono="add" etiqueta="Subir tu parte 5 %" onPress={() => onCambiar(Math.min(100, pctYo + 5))} />
        </View>
      </View>
      <View style={styles.barra} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={{ width: `${pctYo}%`, backgroundColor: fondoYo }} />
        <View style={{ width: `${pctPareja}%`, backgroundColor: fondoPareja }} />
      </View>
      <View style={styles.barraPie} accessible accessibilityLiveRegion="polite">
        <Text style={styles.barraTexto}>
          <Text style={{ color: tintaYo, fontFamily: fonts.bodyBold }}>Tú</Text> {pctYo}{'\u00a0'}%
          {importeYo ? ` · ${importeYo}` : ''}
        </Text>
        <Text style={styles.barraTexto}>
          <Text style={{ color: tintaPareja, fontFamily: fonts.bodyBold }}>{nombrePareja}</Text> {pctPareja}{'\u00a0'}%
          {importePareja ? ` · ${importePareja}` : ''}
        </Text>
      </View>
    </View>
  );
}

function BotonRedondo({ icono, etiqueta, onPress }: { icono: 'add' | 'remove'; etiqueta: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      onPress={onPress}
      style={({ pressed }) => [styles.redondo, pressed && { backgroundColor: colors.surface }]}
    >
      <Ionicons name={icono} size={22} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grupo: { gap: 6 },
  grupoEtiqueta: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textSecondary },
  filaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.full, justifyContent: 'center' },
  chipNormal: { borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.white },
  chipActivo: { backgroundColor: colors.text },
  chipTexto: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  chipTextoActivo: { color: colors.white },
  barraCaja: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl - 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  barraCabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  barraTitulo: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  botones: { flexDirection: 'row', gap: 8 },
  redondo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.text,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barra: { flexDirection: 'row', height: 10, borderRadius: radius.full, overflow: 'hidden', backgroundColor: colors.divider },
  barraPie: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  barraTexto: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
});
