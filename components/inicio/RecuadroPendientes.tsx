import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import type { Pendiente } from '@/lib/gastos/consultas';
import { personas } from '@/lib/gastos/personas';
import { resumenPendientes, textoCortoPendiente, tituloPendientes } from '@/lib/gastos/pendientes';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

const MAX_ICONOS = 3;

/** Recuadro que agrupa 2 o más avisos: plegado muestra conteo y resumen; al tocarlo despliega las tarjetas debajo. */
export function RecuadroPendientes({
  avisos,
  pareja,
  expandido,
  onAlternar,
  children,
}: {
  /** Solo los avisos pendientes de verdad (sin las ya respondidas). */
  avisos: Pendiente[];
  pareja: Pareja;
  expandido: boolean;
  onAlternar: () => void;
  children: ReactNode;
}) {
  const colors = useColores();
  const styles = useStyles();
  const p = personas(pareja, colors);
  const titulo = tituloPendientes(avisos.length);
  const resumen = resumenPendientes(avisos.map((a) => textoCortoPendiente(a, p.yo.slot, p.nombrePareja)));
  return (
    <View style={styles.grupo}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={titulo}
        accessibilityHint={expandido ? 'Toca para ocultarlas' : 'Toca para verlas'}
        accessibilityState={{ expanded: expandido }}
        onPress={onAlternar}
        style={({ pressed }) => [styles.recuadro, pressed && { backgroundColor: colors.surface }]}
      >
        <View style={styles.iconos}>
          {avisos.slice(0, MAX_ICONOS).map((a, i) => (
            <View key={a.id} style={[styles.icono, i > 0 && styles.solapado]}>
              {a.tipo === 'cobro' || a.tipo === 'quienPago' ? (
                <View style={styles.iconoCobro}>
                  <Ionicons name={a.tipo === 'cobro' ? 'repeat-outline' : 'wallet-outline'} size={16} color={colors.icon} />
                </View>
              ) : (
                <AvatarPersona nombre={p.nombrePareja} color={p.otra?.color ?? null} avatarPath={p.otra?.avatarPath} tamano={28} />
              )}
            </View>
          ))}
        </View>
        <View style={styles.textos}>
          <Text style={styles.titulo}>{titulo}</Text>
          <Text style={styles.resumen} numberOfLines={1}>
            {resumen}
          </Text>
        </View>
        <Ionicons name={expandido ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
      </Pressable>
      {expandido ? children : null}
    </View>
  );
}

const useStyles = crearEstilos((colors) => ({
  grupo: { gap: 8 },
  recuadro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl - 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  iconos: { flexDirection: 'row', alignItems: 'center' },
  icono: { borderRadius: 18, borderWidth: 2, borderColor: colors.card, backgroundColor: colors.card },
  solapado: { marginLeft: -10 },
  iconoCobro: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  textos: { flex: 1, gap: 2 },
  titulo: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  resumen: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
}));
