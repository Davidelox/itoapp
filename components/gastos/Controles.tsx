import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { colors, fonts, radius } from '@/constants/theme';

/** Chip redondeado: relleno oscuro cuando está elegido (mockup AnadirGasto). */
export function Chip({
  etiqueta,
  activo,
  onPress,
  rol = 'button',
  icono,
  deshabilitado = false,
  pista,
}: {
  etiqueta: string;
  activo: boolean;
  onPress: () => void;
  rol?: 'button' | 'radio';
  /** Icono de Ionicons a la izquierda del texto. */
  icono?: ComponentProps<typeof Ionicons>['name'];
  /** No se puede elegir (atenuado). `pista` dice por qué a los lectores de pantalla. */
  deshabilitado?: boolean;
  pista?: string;
}) {
  return (
    <Pressable
      accessibilityRole={rol}
      accessibilityLabel={etiqueta}
      accessibilityHint={pista}
      accessibilityState={rol === 'radio' ? { checked: activo, disabled: deshabilitado } : { selected: activo, disabled: deshabilitado }}
      disabled={deshabilitado}
      onPress={onPress}
      style={[styles.chip, activo ? styles.chipActivo : styles.chipNormal, deshabilitado && styles.chipDeshabilitado]}
    >
      {icono ? <Ionicons name={icono} size={15} color={activo ? colors.white : colors.text} /> : null}
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

/** Tarjeta con título, una línea de ayuda y un interruptor (Evento secreto, Mostrar en el calendario…). */
export function Interruptor({
  titulo,
  ayuda,
  valor,
  onCambiar,
  deshabilitado = false,
}: {
  titulo: string;
  ayuda: string;
  valor: boolean;
  onCambiar: (v: boolean) => void;
  deshabilitado?: boolean;
}) {
  return (
    <View style={styles.interruptor}>
      <View style={styles.interruptorTextos}>
        <Text style={styles.interruptorTitulo}>{titulo}</Text>
        <Text style={styles.interruptorAyuda}>{ayuda}</Text>
      </View>
      <Switch
        accessibilityLabel={titulo}
        value={valor}
        disabled={deshabilitado}
        onValueChange={onCambiar}
        trackColor={{ true: colors.accent, false: '#CFC8BB' }}
        thumbColor={colors.white}
        // En web la bolita usa activeThumbColor (react-native-web); en nativo basta thumbColor.
        {...{ activeThumbColor: colors.white }}
      />
    </View>
  );
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
  interruptor: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingLeft: 16,
    paddingRight: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  interruptorTextos: { flex: 1, gap: 1 },
  interruptorTitulo: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  interruptorAyuda: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.full, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  chipDeshabilitado: { opacity: 0.4 },
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
