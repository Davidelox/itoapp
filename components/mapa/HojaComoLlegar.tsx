import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text } from 'react-native';

import { Hoja } from '@/components/gastos/Hoja';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, radius } from '@/constants/theme';
import { urlsComoLlegar } from '@/lib/mapa/sitio';
import type { Sitio } from '@/lib/mapa/tipos';

/** «Cómo llegar» (docs/plan-mapa.md §5.3): hoja inferior con la ruta en Apple Maps (solo iOS), Google Maps y Waze. */
export function HojaComoLlegar({ sitio, visible, onCerrar }: { sitio: Pick<Sitio, 'name' | 'lat' | 'lng'>; visible: boolean; onCerrar: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const urls = urlsComoLlegar(sitio);
  const opciones = [
    ...(Platform.OS === 'ios' ? [{ etiqueta: 'Apple Maps', url: urls.apple }] : []),
    { etiqueta: 'Google Maps', url: urls.google },
    { etiqueta: 'Waze', url: urls.waze },
  ];
  const abrir = async (url: string) => {
    setError(null);
    try {
      await Linking.openURL(url);
      onCerrar();
    } catch {
      setError('No se ha podido abrir la aplicación.');
    }
  };
  return (
    <Hoja visible={visible} titulo="Cómo llegar" onCerrar={onCerrar}>
      {opciones.map((o) => (
        <Pressable
          key={o.etiqueta}
          accessibilityRole="button"
          accessibilityLabel={`Ir a ${sitio.name} con ${o.etiqueta}`}
          onPress={() => abrir(o.url)}
          style={({ pressed }) => [styles.fila, pressed && { backgroundColor: colors.surface }]}
        >
          <Ionicons name="navigate-outline" size={20} color={colors.accent} />
          <Text style={styles.texto}>{o.etiqueta}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </Pressable>
      ))}
      <MensajeError texto={error} />
    </Hoja>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  texto: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
});
