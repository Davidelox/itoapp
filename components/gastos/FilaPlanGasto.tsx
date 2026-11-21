import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmojiIcono } from '@/components/mapa/EmojiIcono';
import { colors, fonts, radius } from '@/constants/theme';
import { formatearImporte } from '@/lib/dinero/importe';
import type { FilaLista } from '@/lib/gastos/agrupar';
import { fechaCorta } from '@/lib/gastos/fechas';
import { cuentaGastos } from '@/lib/gastos/planes';

type FilaPlan = Extract<FilaLista<unknown>, { tipo: 'plan' }>;

/** Texto de la fila agrupada: «Escapada a Lisboa, 312,00 €, 7 gastos». */
export const resumenFilaPlan = (f: Pick<FilaPlan, 'plan' | 'resumen'>) => `${f.plan.nombre}, ${formatearImporte(f.resumen.gastadoCents)}, ${cuentaGastos(f.resumen.cuantos)}`;

/** Todos los gastos de un plan en una sola fila de las listas de Gastos: emoji, nombre, total acumulado y cuántos son. Abre el plan. */
export function FilaPlanGasto({ fila, conFecha = false, separador = false, onPress }: { fila: FilaPlan; conFecha?: boolean; separador?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${resumenFilaPlan(fila)}. Plan`}
      accessibilityHint="Abre el plan con el desglose de sus gastos"
      onPress={onPress}
      style={({ pressed }) => [styles.fila, separador && styles.separador, pressed && styles.pulsada]}
    >
      <View style={styles.baldosa}>
        <EmojiIcono emoji={fila.plan.icono} size={22} />
      </View>
      <View style={styles.textos}>
        <Text style={styles.nombre} numberOfLines={1}>
          {fila.plan.nombre}
        </Text>
        <Text style={styles.detalle} numberOfLines={1}>
          {conFecha ? `${fechaCorta(fila.fecha)} · ` : ''}
          {cuentaGastos(fila.resumen.cuantos)} · Plan
        </Text>
      </View>
      <Text style={styles.importe}>{formatearImporte(fila.resumen.gastadoCents)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, minHeight: 58 },
  separador: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  pulsada: { opacity: 0.6 },
  baldosa: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  textos: { flex: 1, minWidth: 0, gap: 2 },
  nombre: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  detalle: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
  importe: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text, marginLeft: radius.sm },
});
