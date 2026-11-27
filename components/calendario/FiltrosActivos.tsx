import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Marcador } from '@/components/calendario/Marcador';
import { fonts } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import type { Filtro, Filtros } from '@/lib/calendario/agrupar';
import { marcadorFiltro } from '@/lib/calendario/colores';
import { OPCIONES_FILTRO, etiquetaFiltro } from '@/lib/calendario/filtros';

/**
 * Fila bajo la barra con los filtros activos (docs/plan-calendario-v3.md §3): una píldora por filtro (tocarla lo
 * quita) en un scroll horizontal y, fija a la derecha y fuera del scroll, el botón que los quita todos (embudo + ✕).
 * No sale si no hay ninguno.
 */
export function FiltrosActivos({ filtros, onQuitar, onLimpiar }: { filtros: Filtros; onQuitar: (f: Filtro) => void; onLimpiar: () => void }) {
  const colors = useColores();
  const styles = useStyles();
  if (filtros.length === 0) return null;
  return (
    <Animated.View entering={FadeIn.duration(140)} style={styles.fila}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.pildoras}>
        {OPCIONES_FILTRO.filter((o) => filtros.includes(o.valor)).map((o) => (
          <Pressable
            key={o.valor}
            accessibilityRole="button"
            accessibilityLabel={`Quitar filtro ${etiquetaFiltro(o.valor)}`}
            onPress={() => onQuitar(o.valor)}
            hitSlop={{ top: 6, bottom: 6 }}
            style={({ pressed }) => [styles.pildora, pressed && { backgroundColor: colors.pressed }]}
          >
            <Marcador marcador={marcadorFiltro(o, true, colors)} tamano={16} />
            <Text style={styles.pildoraTexto} maxFontSizeMultiplier={1.2}>
              {o.etiqueta}
            </Text>
            <Ionicons name="close" size={14} color={colors.accent} />
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quitar todos los filtros"
        onPress={onLimpiar}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        style={({ pressed }) => [styles.quitarTodos, pressed && { backgroundColor: colors.pressed }]}
      >
        <Ionicons name="funnel" size={14} color={colors.icon} />
        <Ionicons name="close" size={14} color={colors.icon} />
      </Pressable>
    </Animated.View>
  );
}

const useStyles = crearEstilos((colors) => ({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scroll: { flex: 1 },
  pildoras: { gap: 8, alignItems: 'center', paddingVertical: 1 },
  pildora: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  pildoraTexto: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.accent },
  quitarTodos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
}));
