import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, personColors } from '@/constants/theme';
import { personas } from '@/lib/gastos/personas';
import { textoEstrellas, textoValoracionHablado, valoracionDe } from '@/lib/mapa/lista';
import type { Sitio } from '@/lib/mapa/tipos';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

/** Estrellas de solo lectura (5, con media) en un único elemento accesible. */
export function Estrellas({ valor, tamano = 14 }: { valor: number; tamano?: number }) {
  return (
    <View style={styles.estrellas}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons key={n} name={valor >= n ? 'star' : valor >= n - 0.5 ? 'star-half' : 'star-outline'} size={tamano} color={colors.paymentDot} />
      ))}
    </View>
  );
}

/**
 * Valoración de cada uno en una fila con su color de persona (relleno `bg` + contorno `ink`, como los avatares).
 * Solo salen las personas que han puntuado; devuelve null si no hay ninguna.
 */
export function ValoracionesPareja({ sitio, pareja, userId }: { sitio: Sitio; pareja: Pareja; userId: string | null }) {
  const p = personas(pareja);
  const filas = [
    { nombre: p.yo.nombre, color: p.yo.color, valor: valoracionDe(sitio, userId), etiqueta: 'Tu valoración' },
    p.otra ? { nombre: p.nombrePareja, color: p.otra.color, valor: valoracionDe(sitio, p.otra.userId), etiqueta: `Valoración de ${p.nombrePareja}` } : null,
  ].filter((f): f is NonNullable<typeof f> => f !== null && f.valor !== null);
  if (filas.length === 0) return null;
  return (
    <View style={styles.filas}>
      {filas.map((f) => {
        const paleta = f.color ? personColors[f.color] : { bg: colors.surface, ink: colors.icon };
        return (
          <View
            key={f.etiqueta}
            accessible
            accessibilityLabel={`${f.etiqueta}: ${textoValoracionHablado(f.valor as number)}`}
            style={[styles.fila, { backgroundColor: paleta.bg, borderColor: paleta.ink }]}
          >
            <Text style={[styles.nombre, { color: paleta.ink }]} numberOfLines={1}>
              {f.nombre}
            </Text>
            <Estrellas valor={f.valor as number} />
            <Text style={[styles.numero, { color: paleta.ink }]}>{textoEstrellas(f.valor as number)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  estrellas: { flexDirection: 'row', gap: 1 },
  filas: { gap: 6 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, alignSelf: 'flex-start' },
  nombre: { fontFamily: fonts.bodyBold, fontSize: 13, maxWidth: 120 },
  numero: { fontFamily: fonts.bodyBold, fontSize: 13 },
});
