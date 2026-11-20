import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmojiIcono } from '@/components/mapa/EmojiIcono';
import { colors, fonts, radius } from '@/constants/theme';
import {
  type Seleccion,
  elegirColeccion,
  etiquetaMantener,
  hacerPrincipal,
  quitarDeLasDemas,
  textoPreguntaQuitar,
} from '@/lib/mapa/colecciones';
import type { Coleccion } from '@/lib/mapa/tipos';

/**
 * Selector de colecciones de un sitio (mockup GuardarSitio): una píldora por colección (varias elegibles), «+ Nueva»,
 * la pregunta «¿Quitarlo de …?» al añadir a una segunda y, por cada elegida, «Hacer principal» (la principal da el icono del pin).
 * Controlado: `valor` es la selección y `onCambiar` la devuelve ya con la principal resuelta.
 */
export function SelectorColecciones({
  colecciones,
  valor,
  onCambiar,
  onNueva,
}: {
  colecciones: Coleccion[];
  valor: Seleccion;
  onCambiar: (s: Seleccion) => void;
  onNueva: () => void;
}) {
  // La colección recién añadida y las anteriores por las que se pregunta; se descarta al decidir.
  const [pregunta, setPregunta] = useState<{ nueva: string; otras: string[] } | null>(null);
  const porId = new Map(colecciones.map((c) => [c.id, c]));
  const elegidas = valor.ids.flatMap((id) => porId.get(id) ?? []);

  const alternar = (id: string) => {
    const { seleccion, preguntar } = elegirColeccion(valor, id);
    onCambiar(seleccion);
    setPregunta(preguntar.length > 0 ? { nueva: id, otras: preguntar } : null);
  };
  const otras = pregunta ? pregunta.otras.flatMap((id) => porId.get(id) ?? []) : [];
  // Si se desmarca una de las de la pregunta, deja de tener sentido preguntar por ella.
  const preguntando = pregunta && valor.ids.includes(pregunta.nueva) ? otras.filter((c) => valor.ids.includes(c.id)) : [];

  return (
    <View style={styles.raiz}>
      <View style={styles.pildoras} accessibilityRole="none">
        {colecciones.map((c) => {
          const on = valor.ids.includes(c.id);
          const principal = on && valor.principal === c.id;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${c.name}${principal ? ', colección principal' : ''}`}
              onPress={() => alternar(c.id)}
              style={[styles.pildora, on ? styles.pildoraOn : styles.pildoraOff]}
            >
              <EmojiIcono emoji={c.icon} size={15} />
              <Text style={[styles.pildoraTexto, on && { color: colors.white }]} numberOfLines={1}>
                {c.name}
              </Text>
              {principal ? <Ionicons name="star" size={13} color={colors.white} /> : null}
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" accessibilityLabel="Nueva colección" onPress={onNueva} style={[styles.pildora, styles.nueva]}>
          <Text style={styles.pildoraTexto}>+ Nueva</Text>
        </Pressable>
      </View>

      {preguntando.length > 0 && pregunta ? (
        <View style={styles.pregunta} accessibilityRole="alert">
          <Text style={styles.preguntaTexto}>{textoPreguntaQuitar(preguntando)}</Text>
          <View style={styles.botones}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onCambiar(quitarDeLasDemas(pregunta.nueva));
                setPregunta(null);
              }}
              style={[styles.boton, styles.botonRelleno]}
            >
              <Text style={[styles.botonTexto, { color: colors.white }]}>Quitar</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setPregunta(null)} style={[styles.boton, styles.botonBorde]}>
              <Text style={styles.botonTexto}>{etiquetaMantener(preguntando.length)}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {elegidas.length > 0 ? (
        <View style={styles.lista}>
          {elegidas.map((c, i) => {
            const principal = valor.principal === c.id;
            return (
              <View key={c.id} style={[styles.fila, i < elegidas.length - 1 && styles.filaSeparada]}>
                <Text style={styles.filaTexto} numberOfLines={1}>
                  <Text accessible={false}>{c.icon}</Text> {c.name}
                </Text>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: principal }}
                  accessibilityLabel={principal ? `${c.name}, colección principal` : `Hacer principal: ${c.name}`}
                  onPress={() => onCambiar(hacerPrincipal(valor, c.id))}
                  style={styles.principal}
                >
                  <Ionicons name={principal ? 'star' : 'star-outline'} size={18} color={principal ? colors.text : colors.textSecondary} />
                  <Text style={[styles.principalTexto, principal && { color: colors.text }]}>{principal ? 'Principal' : 'Hacer principal'}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}
      <Text style={styles.nota}>La principal da el icono del pin.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { gap: 8 },
  pildoras: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pildora: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: radius.full },
  pildoraOn: { backgroundColor: colors.text },
  pildoraOff: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.inputBorder },
  nueva: { backgroundColor: colors.white, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B9B2A4' },
  pildoraTexto: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, flexShrink: 1 },
  pregunta: { gap: 8, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface },
  preguntaTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  botones: { flexDirection: 'row', gap: 8 },
  boton: { flex: 1, minHeight: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  botonRelleno: { backgroundColor: colors.accent },
  botonBorde: { borderWidth: 1.5, borderColor: colors.text, backgroundColor: colors.white },
  botonTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text, textAlign: 'center' },
  lista: { paddingHorizontal: 12, borderRadius: radius.lg, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  filaSeparada: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  filaTexto: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  principal: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 6 },
  principalTexto: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textSecondary },
  nota: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
});
