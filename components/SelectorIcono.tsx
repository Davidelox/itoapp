import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Grupo } from '@/components/gastos/Controles';
import { EmojiIcono } from '@/components/mapa/EmojiIcono';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, radius } from '@/constants/theme';
import { EMOJIS_SUGERIDOS, primerEmoji } from '@/lib/mapa/colecciones';

/**
 * Selector de icono emoji: unos sugeridos (por defecto los de las colecciones) y «Otro…», que abre el teclado de emojis
 * del móvil. Lo usan los formularios de colección y de plan.
 */
export function SelectorIcono({
  etiqueta,
  valor,
  onCambiar,
  sugeridos = EMOJIS_SUGERIDOS,
  error,
}: {
  /** Título del grupo y del grupo de radios: «Icono de la colección». */
  etiqueta: string;
  valor: string;
  onCambiar: (emoji: string) => void;
  sugeridos?: readonly { emoji: string; nombre: string }[];
  error?: string | null;
}) {
  const [otroAbierto, setOtroAbierto] = useState(false);
  const esSugerido = sugeridos.some((e) => e.emoji === valor);
  const otroMarcado = otroAbierto || !esSugerido;
  return (
    <Grupo etiqueta={etiqueta} rol="radiogroup">
      <View style={styles.rejilla}>
        {sugeridos.map((e) => {
          const on = e.emoji === valor && !otroAbierto;
          return (
            <Pressable
              key={e.emoji}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={e.nombre}
              onPress={() => {
                onCambiar(e.emoji);
                setOtroAbierto(false);
              }}
              style={[styles.emoji, on && styles.emojiOn]}
            >
              <EmojiIcono emoji={e.emoji} size={26} />
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: otroMarcado }}
          accessibilityLabel={!esSugerido ? `Otro icono: ${valor}` : 'Otro icono'}
          onPress={() => setOtroAbierto(true)}
          style={[styles.emoji, otroMarcado && styles.emojiOn]}
        >
          {otroMarcado && !esSugerido ? <EmojiIcono emoji={valor} size={26} /> : <Text style={styles.otro}>{!esSugerido ? valor : 'Otro…'}</Text>}
        </Pressable>
      </View>
      {otroAbierto || !esSugerido ? (
        <View style={styles.otroCaja}>
          <Text style={styles.nota}>Abre el teclado de emojis de tu móvil y elige el que quieras.</Text>
          <TextInput
            accessibilityLabel="Icono personalizado"
            value={esSugerido ? '' : valor}
            onChangeText={(t) => {
              const e = primerEmoji(t);
              if (e) onCambiar(e);
            }}
            autoFocus={otroAbierto && esSugerido}
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.campoEmoji}
          />
        </View>
      ) : null}
      <MensajeError texto={error} />
    </Grupo>
  );
}

const styles = StyleSheet.create({
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emoji: { width: '23%', flexGrow: 1, height: 52, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' },
  emojiOn: { borderWidth: 2, borderColor: colors.text },
  otro: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  otroCaja: { gap: 6 },
  nota: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  campoEmoji: { height: 50, paddingHorizontal: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.white, fontFamily: fonts.body, fontSize: 24, color: colors.text, textAlign: 'center' },
});
