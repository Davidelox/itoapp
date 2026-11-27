import { useState } from 'react';
import { Pressable, Text, type StyleProp, type TextStyle } from 'react-native';

import { fonts } from '@/constants/theme';
import { useColores } from '@/lib/tema';

/** Desde cuántos caracteres un texto se recorta con «Ver más». */
export const UMBRAL_TEXTO_LARGO = 280;

/**
 * Texto libre (notas) mostrado ENTERO, con sus saltos de línea. Si es muy largo (> 280 caracteres) empieza recortado
 * a unas líneas con «Ver más» / «Ver menos». El estado solo cambia en el manejador del botón.
 */
export function TextoLargo({ texto, style, lineasRecortado = 6 }: { texto: string; style?: StyleProp<TextStyle>; lineasRecortado?: number }) {
  const colors = useColores();
  const [abierto, setAbierto] = useState(false);
  const largo = texto.length > UMBRAL_TEXTO_LARGO;
  return (
    <>
      <Text style={style} numberOfLines={largo && !abierto ? lineasRecortado : undefined}>
        {texto}
      </Text>
      {largo ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={abierto ? 'Ver menos' : 'Ver más'}
          accessibilityState={{ expanded: abierto }}
          onPress={() => setAbierto((a) => !a)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.accent, textDecorationLine: 'underline' }}>
            {abierto ? 'Ver menos' : 'Ver más'}
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}
