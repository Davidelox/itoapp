import { Ionicons } from '@expo/vector-icons';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, Text, View, findNodeHandle } from 'react-native';

import { HojaComoLlegar } from '@/components/mapa/HojaComoLlegar';
import { PinSitio } from '@/components/mapa/PinSitio';
import { ValoracionesPareja } from '@/components/mapa/Valoraciones';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { ETIQUETA_ESTADO, textoSecundario } from '@/lib/mapa/lista';
import type { Sitio } from '@/lib/mapa/tipos';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

/**
 * Tarjeta flotante al tocar un pin (docs/plan-mapa.md §5.1): no es una `Hoja`, para no tapar el mapa ni bloquearlo.
 * Nombre, categoría y estado, las valoraciones, «Cómo llegar» y «Ver ficha». Al abrirse, el foco del lector de pantalla va al título.
 */
export function TarjetaSitio({ sitio, pareja, emoji = null, onFicha, onCerrar }: { sitio: Sitio; pareja: Pareja; emoji?: string | null; onFicha: () => void; onCerrar: () => void }) {
  const colors = useColores();
  const styles = useStyles();
  const [llegar, setLlegar] = useState(false);
  const titulo = useRef<ComponentRef<typeof Text>>(null);
  useEffect(() => {
    if (Platform.OS === 'web') return; // `findNodeHandle` lanza en web
    const nodo = titulo.current ? findNodeHandle(titulo.current) : null;
    if (nodo) AccessibilityInfo.setAccessibilityFocus(nodo);
  }, [sitio.id]);
  return (
    <View style={styles.tarjeta}>
      <View style={styles.cabecera}>
        <PinSitio categoria={sitio.category} estado={sitio.status} privado={!sitio.visible_to_partner} tamano={32} emoji={emoji} />
        <View style={styles.textos}>
          <Text ref={titulo} accessibilityRole="header" style={styles.nombre} numberOfLines={2}>
            {sitio.name}
          </Text>
          <Text style={styles.linea} numberOfLines={1}>
            {ETIQUETA_ESTADO[sitio.status]} · {textoSecundario(sitio)}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onCerrar} hitSlop={10} style={styles.cerrar}>
          <Ionicons name="close" size={20} color={colors.icon} />
        </Pressable>
      </View>
      <ValoracionesPareja sitio={sitio} pareja={pareja} userId={pareja.yo.userId} />
      <View style={styles.botones}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Cómo llegar a ${sitio.name}`} onPress={() => setLlegar(true)} style={({ pressed }) => [styles.boton, styles.botonClaro, pressed && { backgroundColor: colors.border }]}>
          <Text style={[styles.botonTexto, { color: colors.text }]}>Cómo llegar</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Ver ficha de ${sitio.name}`} onPress={onFicha} style={({ pressed }) => [styles.boton, pressed && { backgroundColor: colors.accentDark }]}>
          <Text style={styles.botonTexto}>Ver ficha</Text>
        </Pressable>
      </View>
      <HojaComoLlegar sitio={sitio} visible={llegar} onCerrar={() => setLlegar(false)} />
    </View>
  );
}

const useStyles = crearEstilos((colors) => ({
  tarjeta: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    gap: 10,
    padding: 14,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.sombra,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textos: { flex: 1, minWidth: 0, gap: 2 },
  nombre: { fontFamily: fonts.title, fontSize: 18, color: colors.text },
  linea: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  cerrar: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  botones: { flexDirection: 'row', gap: 8 },
  botonClaro: { backgroundColor: colors.surface },
  boton: { flex: 1, minHeight: 44, borderRadius: radius.full, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.onAccent },
}));
