import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '@/constants/theme';
import { formatearImporte } from '@/lib/dinero/importe';
import { INFO_CATEGORIA } from '@/lib/gastos/categorias';
import type { Gasto } from '@/lib/gastos/consultas';
import { fechaCorta } from '@/lib/gastos/fechas';
import { lineaPlan, planDe } from '@/lib/gastos/planes';
import { personas } from '@/lib/gastos/personas';
import { etiquetaReparto } from '@/lib/gastos/reparto';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

/** Icono de la categoría en su cuadro gris. */
export function IconoCategoria({ categoria, tamano = 40 }: { categoria: Gasto['category']; tamano?: number }) {
  return (
    <View style={[styles.icono, { width: tamano, height: tamano, borderRadius: tamano / 3 }]}>
      <Ionicons name={INFO_CATEGORIA[categoria].icono} size={tamano / 2} color={colors.icon} />
    </View>
  );
}

/** Quién pagó, en la tinta de esa persona: «Pagaste tú», «Pagó Meri», «Pagó el bote». */
export function textoPagador(gasto: Gasto, pareja: Pareja) {
  const p = personas(pareja);
  if (gasto.paid_by === 'pot') return { texto: 'Pagó el bote', color: colors.text };
  if (gasto.paid_by === p.yo.slot) return { texto: 'Pagaste tú', color: p.tintaYo };
  return { texto: `Pagó ${p.nombrePareja}`, color: p.tintaPareja };
}

type Props = { gasto: Gasto; pareja: Pareja; conFecha?: boolean; onPress: () => void; separador?: boolean; /** Dentro del propio plan, la línea del plan sobra. */ ocultarPlan?: boolean };

/** Fila de la lista de gastos (mockups Gastos e Historial). */
export function FilaGasto({ gasto, pareja, conFecha = false, onPress, separador = false, ocultarPlan = false }: Props) {
  const p = personas(pareja);
  const pagador = textoPagador(gasto, pareja);
  const reparto = etiquetaReparto(gasto.split_mode, p.yo.slot, gasto.split_pct_m1, p.nombrePareja);
  const categoria = INFO_CATEGORIA[gasto.category].nombre;
  const plan = ocultarPlan ? null : planDe(gasto);
  const inicio = conFecha ? `${fechaCorta(gasto.spent_on)} · ${categoria}` : categoria;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${gasto.concept}, ${formatearImporte(gasto.amount_cents)}. ${inicio}. ${pagador.texto}, ${reparto}.${
        gasto.visible_to_partner ? '' : ' Solo lo ves tú.'
      }${plan ? ` Plan: ${plan.nombre}.` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.fila, separador && styles.separador, pressed && styles.pulsada]}
    >
      <IconoCategoria categoria={gasto.category} />
      <View style={styles.textos}>
        <Text style={styles.concepto} numberOfLines={1}>
          {gasto.concept}
        </Text>
        <Text style={styles.detalle} numberOfLines={1}>
          {inicio} · <Text style={[styles.pagador, { color: pagador.color }]}>{pagador.texto}</Text> · {reparto}
        </Text>
        {plan ? (
          <Text style={styles.privadoTexto} numberOfLines={1} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {lineaPlan(plan)}
          </Text>
        ) : null}
        {gasto.liquidacion ? (
          <View style={styles.privado}>
            <Ionicons name={gasto.liquidacion.status === 'confirmed' ? 'checkmark-circle-outline' : 'time-outline'} size={12} color={colors.textSecondary} />
            <Text style={styles.privadoTexto}>{gasto.liquidacion.status === 'confirmed' ? 'Saldado' : 'Pendiente de confirmar'}</Text>
          </View>
        ) : null}
        {!gasto.visible_to_partner ? (
          <View style={styles.privado}>
            <Ionicons name="lock-closed-outline" size={12} color={colors.textSecondary} />
            <Text style={styles.privadoTexto}>Solo lo ves tú</Text>
          </View>
        ) : null}
        {gasto.recurring_occurrence_id ? (
          <View style={styles.privado}>
            <Ionicons name="repeat-outline" size={12} color={colors.textSecondary} />
            <Text style={styles.privadoTexto}>Recurrente</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.importe}>{formatearImporte(gasto.amount_cents)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, minHeight: 58 },
  separador: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  pulsada: { opacity: 0.6 },
  icono: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  textos: { flex: 1, minWidth: 0, gap: 2 },
  concepto: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  detalle: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
  pagador: { fontFamily: fonts.bodyBold },
  privado: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  privadoTexto: { fontFamily: fonts.body, fontSize: 11, color: colors.textSecondary },
  importe: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text, marginLeft: radius.sm },
});
