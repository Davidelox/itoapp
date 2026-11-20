import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HojaComoLlegar } from '@/components/mapa/HojaComoLlegar';
import { colors, fonts, radius } from '@/constants/theme';
import { sitioEnlazado } from '@/lib/mapa/conexiones';
import { useSitios } from '@/lib/mapa/useSitios';

/**
 * Sitio del Mapa enlazado desde un evento o un gasto (docs/plan-mapa.md F7): nombre con enlace a la ficha y, con
 * `acciones`, «Cómo llegar» y «Ver en el mapa». Si esta persona no lo ve (borrado o privado de su pareja) sale
 * «Sitio no disponible»; sin sitio o mientras carga, nada.
 */
export function SitioEnlazado({ placeId, acciones = false }: { placeId: string | null; acciones?: boolean }) {
  const router = useRouter();
  const { data } = useSitios();
  const [comoLlegar, setComoLlegar] = useState(false);
  const estado = sitioEnlazado(data, placeId);
  if (estado.tipo !== 'visible') {
    return estado.tipo === 'no_disponible' ? <Text style={styles.noDisponible}>Sitio no disponible</Text> : null;
  }

  const { sitio } = estado;
  const abrirFicha = () => router.push({ pathname: '/mapa/sitio/[id]', params: { id: sitio.id } });
  return (
    <View style={styles.raiz}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Sitio: ${sitio.name}`}
        accessibilityHint="Abre la ficha del sitio"
        onPress={abrirFicha}
        style={styles.enlaceSitio}
      >
        <Text style={styles.nombre}>{sitio.name}</Text>
      </Pressable>
      {acciones ? (
        <View style={styles.botones}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Cómo llegar a ${sitio.name}`} onPress={() => setComoLlegar(true)} style={styles.boton}>
            <Text style={styles.botonTexto}>Cómo llegar</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${sitio.name} en el mapa`} onPress={abrirFicha} style={styles.boton}>
            <Text style={styles.botonTexto}>Ver en el mapa</Text>
          </Pressable>
          <HojaComoLlegar sitio={sitio} visible={comoLlegar} onCerrar={() => setComoLlegar(false)} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { gap: 2 },
  enlaceSitio: { minHeight: 44, justifyContent: 'center' },
  nombre: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.accent, textDecorationLine: 'underline' },
  noDisponible: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.textSecondary },
  botones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  boton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.full, backgroundColor: colors.surface },
  botonTexto: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
});
