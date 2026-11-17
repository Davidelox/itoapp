import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '@/constants/theme';
import { formatearImporte } from '@/lib/dinero/importe';
import { esPersonal, fechaCobro, proximoCobro, totales } from '@/lib/gastos/recurrentes';
import { useRecurrentes } from '@/lib/gastos/useGastos';

/** Tarjeta de Gastos que abre Pagos recurrentes: total al mes y próximo cobro (docs/plan-gastos-fase4.md §2). */
export function TarjetaRecurrentes({ onAbrir }: { onAbrir: () => void }) {
  const consulta = useRecurrentes();
  const todos = consulta.data ?? [];
  // Como la lista: el total y el próximo cobro son de los compartidos.
  const lista = todos.filter((r) => !esPersonal(r));
  const t = totales(lista);
  const proximo = lista
    .map((r) => ({ r, fecha: proximoCobro(r) }))
    .filter((x): x is { r: (typeof lista)[number]; fecha: string } => !!x.fecha)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  const linea =
    todos.length === 0
      ? 'Suscripciones, facturas y cuotas que se apuntan solas'
      : `${formatearImporte(t.mes)} al mes compartidos${proximo ? ` · próximo: ${proximo.r.name}, ${fechaCobro(proximo.fecha)}` : ''}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Pagos recurrentes. ${linea}`}
      onPress={onAbrir}
      style={({ pressed }) => [styles.tarjeta, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.icono}>
        <Ionicons name="repeat-outline" size={20} color={colors.icon} />
      </View>
      <View style={styles.textos}>
        <Text style={styles.titulo}>Pagos recurrentes</Text>
        <Text style={styles.linea} numberOfLines={2}>
          {linea}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl - 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 64,
  },
  icono: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  textos: { flex: 1, minWidth: 0, gap: 2 },
  titulo: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  linea: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
});
