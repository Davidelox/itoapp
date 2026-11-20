import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, radius } from '@/constants/theme';
import type { Region } from '@/lib/mapa/encuadre';
import { leerCoordenada } from '@/lib/mapa/sitio';

export const SELECTOR_CON_MAPA = false;

/** En web no hay mapa (docs/plan-mapa.md §2): las coordenadas se escriben. */
export function SelectorUbicacion({ inicial, onCambiar }: { inicial: Region; onCambiar: (lat: number, lng: number) => void }) {
  const [lat, setLat] = useState(String(inicial.latitude));
  const [lng, setLng] = useState(String(inicial.longitude));
  const cambiar = (nuevaLat: string, nuevaLng: string) => {
    setLat(nuevaLat);
    setLng(nuevaLng);
    const a = leerCoordenada(nuevaLat);
    const b = leerCoordenada(nuevaLng);
    onCambiar(a ?? Number.NaN, b ?? Number.NaN);
  };
  return (
    <View style={styles.fila}>
      <TextInput accessibilityLabel="Latitud" value={lat} onChangeText={(t) => cambiar(t, lng)} inputMode="decimal" placeholder="Latitud" placeholderTextColor={colors.textSecondary} style={styles.campo} />
      <TextInput accessibilityLabel="Longitud" value={lng} onChangeText={(t) => cambiar(lat, t)} inputMode="decimal" placeholder="Longitud" placeholderTextColor={colors.textSecondary} style={styles.campo} />
      <Text style={styles.ayuda}>El mapa solo está en la app del móvil.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { gap: 8 },
  campo: { height: 50, paddingHorizontal: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.white, fontFamily: fonts.body, fontSize: 16, color: colors.text },
  ayuda: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
});
