import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';

type Props = {
  icono: ComponentProps<typeof Ionicons>['name'];
  titulo: string;
  detalle: string;
  onPress: () => void;
  /** Destacada: icono granate sobre fondo suave. */
  principal?: boolean;
  cargando?: boolean;
  deshabilitada?: boolean;
};

/** Tarjeta de elección grande (Crear o unirse). La pulsada muestra un indicador y las dos quedan desactivadas. */
export function TarjetaEleccion({ icono, titulo, detalle, onPress, principal = false, cargando = false, deshabilitada = false }: Props) {
  const colors = useColores();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. ${detalle}`}
      accessibilityState={{ disabled: deshabilitada || cargando, busy: cargando }}
      disabled={deshabilitada || cargando}
      onPress={onPress}
      style={({ pressed }) => [styles.tarjeta, pressed && styles.pulsada, deshabilitada && !cargando && styles.apagada]}
    >
      <View style={[styles.icono, { backgroundColor: principal ? colors.accentSoft : colors.surface }]}>
        <Ionicons name={icono} size={26} color={principal ? colors.accent : colors.icon} />
      </View>
      <View style={styles.fila}>
        <View style={styles.textos}>
          <Text style={styles.titulo}>{titulo}</Text>
          <Text style={styles.detalle}>{detalle}</Text>
        </View>
        {cargando ? (
          <CargandoHilo color={colors.textSecondary} />
        ) : (
          <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
        )}
      </View>
    </Pressable>
  );
}

const useStyles = crearEstilos((colors) => ({
  tarjeta: {
    gap: 14,
    padding: 20,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pulsada: { backgroundColor: colors.surface },
  apagada: { opacity: 0.5 },
  icono: { width: 52, height: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textos: { flex: 1, gap: 4 },
  titulo: { fontFamily: fonts.title, fontSize: 21, color: colors.text },
  detalle: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
}));
