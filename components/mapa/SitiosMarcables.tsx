import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/theme';
import { textoSecundario } from '@/lib/mapa/lista';
import type { Sitio } from '@/lib/mapa/tipos';

/** Lista de sitios con casilla («Añadir sitios ahora» de Nueva colección y «Añadir sitios» del detalle de una colección). */
export function SitiosMarcables({ sitios, elegidos, onAlternar }: { sitios: Sitio[]; elegidos: string[]; onAlternar: (id: string) => void }) {
  return (
    <View>
      {sitios.map((s, i) => {
        const on = elegidos.includes(s.id);
        return (
          <Pressable
            key={s.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${s.name}, ${textoSecundario(s)}`}
            onPress={() => onAlternar(s.id)}
            style={[styles.sitio, i < sitios.length - 1 && styles.sitioSeparado]}
          >
            <View style={[styles.casilla, on && styles.casillaOn]}>{on ? <Ionicons name="checkmark" size={18} color={colors.white} /> : null}</View>
            <View style={styles.sitioTextos}>
              <Text style={styles.sitioNombre} numberOfLines={1}>
                {s.name}
              </Text>
              <Text style={styles.nota} numberOfLines={1}>
                {textoSecundario(s)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nota: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  sitio: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  sitioSeparado: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  sitioTextos: { flex: 1, minWidth: 0 },
  sitioNombre: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  casilla: { width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, borderColor: '#B9B2A4', backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  casillaOn: { backgroundColor: colors.accent, borderWidth: 0 },
});
