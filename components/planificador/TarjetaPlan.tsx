import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmojiIcono } from '@/components/mapa/EmojiIcono';
import { BarraPresupuesto } from '@/components/planificador/BarraPresupuesto';
import { colors, fonts, radius } from '@/constants/theme';
import { cuentaAtras, etiquetaPlan, etiquetaTipo, textoFechas, vistaPresupuesto } from '@/lib/planificador/plan';
import { chipsTarjeta, pendientesDe } from '@/lib/planificador/tareas';
import type { PlanLista, Tarea } from '@/lib/planificador/tipos';

/** Tarjeta de un plan en la lista: icono, nombre, fechas, cuenta atrás, tipo, presupuesto y chips de tareas. Toda ella abre el detalle. */
export function TarjetaPlan({ plan, tareas, yo, tintaYo, hoy, onPress }: { plan: PlanLista; tareas: Tarea[]; yo: 'm1' | 'm2'; tintaYo: string; hoy: string; onPress: () => void }) {
  const chips = chipsTarjeta(tareas, yo);
  const cuenta = cuentaAtras(plan, hoy);
  const enCurso = cuenta === 'En curso' || cuenta === 'Hoy';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiquetaPlan(plan, hoy, pendientesDe(tareas))}
      accessibilityHint="Abre el plan"
      onPress={onPress}
      style={({ pressed }) => [styles.tarjeta, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.cabecera}>
        <View style={styles.baldosa}>
          <EmojiIcono emoji={plan.icon} size={26} />
        </View>
        <View style={styles.textos}>
          <Text style={styles.nombre} numberOfLines={2}>
            {plan.name}
          </Text>
          <Text style={styles.fechas}>{textoFechas(plan.start_date, plan.end_date, hoy)}</Text>
        </View>
        <View style={[styles.cuenta, enCurso && styles.cuentaCurso]}>
          <Text style={[styles.cuentaTexto, enCurso && styles.cuentaTextoCurso]}>{cuenta}</Text>
        </View>
      </View>
      <View style={styles.pie}>
        <View style={styles.chip}>
          <Text style={styles.chipTexto}>{etiquetaTipo(plan.type)}</Text>
        </View>
        <View style={styles.presupuesto}>
          <BarraPresupuesto vista={vistaPresupuesto(plan.budget_cents, plan.gastado_cents)} />
        </View>
      </View>
      {chips.hechas.length > 0 || chips.siguiente ? (
        <View style={styles.chips} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {chips.hechas.map((t) => (
            <View key={t} style={[styles.chip, styles.chipHecha]}>
              <Ionicons name="checkmark" size={13} color={colors.accent} />
              <Text style={[styles.chipTexto, styles.chipHechaTexto]} numberOfLines={1}>
                {t}
              </Text>
            </View>
          ))}
          {chips.masHechas > 0 ? (
            <View style={styles.chip}>
              <Text style={styles.chipTexto}>+{chips.masHechas}</Text>
            </View>
          ) : null}
          {chips.siguiente ? (
            <View style={styles.chip}>
              <Text style={[styles.chipTexto, { color: tintaYo }]} numberOfLines={1}>
                {chips.siguiente}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tarjeta: { gap: 12, padding: 14, borderRadius: radius.xl - 4, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  baldosa: { width: 48, height: 48, borderRadius: radius.lg, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  textos: { flex: 1, minWidth: 0, gap: 2 },
  nombre: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  fechas: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  cuenta: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.surface },
  cuentaCurso: { backgroundColor: colors.accent },
  cuentaTexto: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
  cuentaTextoCurso: { color: colors.white },
  pie: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.surface },
  chipTexto: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary },
  presupuesto: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipHecha: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accentSoft },
  chipHechaTexto: { color: colors.accent },
});
