import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PinSitio } from '@/components/mapa/PinSitio';
import { Estrellas } from '@/components/mapa/Valoraciones';
import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { colors, fonts } from '@/constants/theme';
import { etiquetaAccesible, quienGuardo, textoSecundario, valoracionDe } from '@/lib/mapa/lista';
import type { Sitio } from '@/lib/mapa/tipos';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

/** Fila de la Lista: pin de 28 px, nombre, «Restaurante · Calle Mayor 12», tus estrellas, avatar de quien lo guardó y candado si es privado. */
export function FilaSitio({ sitio, pareja, separador, emoji = null, onPress }: { sitio: Sitio; pareja: Pareja; separador: boolean; emoji?: string | null; onPress: () => void }) {
  const mia = valoracionDe(sitio, pareja.yo.userId);
  const quien = quienGuardo(sitio, pareja.yo.userId, pareja.otra?.userId);
  const autor = quien === 'yo' ? pareja.yo : quien === 'otra' ? pareja.otra : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiquetaAccesible(sitio)}
      accessibilityHint="Abre la ficha del sitio"
      onPress={onPress}
      style={({ pressed }) => [styles.fila, separador && styles.separador, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.pin}>
        <PinSitio categoria={sitio.category} estado={sitio.status} tamano={28} emoji={emoji} />
      </View>
      <View style={styles.textos}>
        <Text style={styles.nombre} numberOfLines={2}>
          {sitio.name}
        </Text>
        <Text style={styles.linea} numberOfLines={2}>
          {textoSecundario(sitio)}
        </Text>
        {mia !== null ? <Estrellas valor={mia} tamano={13} /> : null}
      </View>
      {!sitio.visible_to_partner ? <Ionicons name="lock-closed" size={16} color={colors.textSecondary} /> : null}
      {autor && pareja.otra ? <AvatarPersona nombre={autor.nombre} color={autor.color} avatarPath={autor.avatarPath} tamano={24} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10 },
  separador: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  pin: { width: 28, alignItems: 'center' },
  textos: { flex: 1, minWidth: 0, gap: 2 },
  nombre: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  linea: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
});
