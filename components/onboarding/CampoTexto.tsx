import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, fontSizes, radius } from '@/constants/theme';

type Props = Pick<
  TextInputProps,
  | 'value'
  | 'onChangeText'
  | 'keyboardType'
  | 'autoComplete'
  | 'textContentType'
  | 'autoCapitalize'
  | 'autoCorrect'
  | 'returnKeyType'
  | 'onSubmitEditing'
  | 'maxLength'
  | 'editable'
  | 'autoFocus'
  | 'inputMode'
> & {
  etiqueta: string;
  ayuda?: string;
  error?: string | null;
  /** Campo de contraseña: oculta el texto y muestra «Mostrar / Ocultar». Pegar sigue permitido. */
  contrasena?: boolean;
};

export function CampoTexto({ etiqueta, ayuda, error, contrasena = false, ...resto }: Props) {
  const [visible, setVisible] = useState(false);
  const [enfocado, setEnfocado] = useState(false);
  return (
    <View style={styles.grupo}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <View style={[styles.caja, enfocado && styles.cajaEnfocada, !!error && styles.cajaError]}>
        <TextInput
          {...resto}
          accessibilityLabel={etiqueta}
          secureTextEntry={contrasena && !visible}
          onFocus={() => setEnfocado(true)}
          onBlur={() => setEnfocado(false)}
          placeholderTextColor={colors.textSecondary}
          style={styles.entrada}
        />
        {contrasena && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            onPress={() => setVisible((v) => !v)}
            hitSlop={4}
            style={styles.mostrar}
          >
            <Text style={styles.mostrarTexto}>{visible ? 'Ocultar' : 'Mostrar'}</Text>
          </Pressable>
        )}
      </View>
      {ayuda && !error ? <Text style={styles.ayuda}>{ayuda}</Text> : null}
      <MensajeError texto={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  grupo: { gap: 6 },
  etiqueta: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.small, color: colors.text },
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.white,
    paddingLeft: 14,
  },
  cajaEnfocada: { borderColor: colors.text, borderWidth: 1.5 },
  cajaError: { borderColor: colors.accent, borderWidth: 1.5 },
  entrada: {
    flex: 1,
    minHeight: 50,
    fontFamily: fonts.body,
    fontSize: fontSizes.body,
    color: colors.text,
    // En web el anillo de foco ya lo dibuja la caja.
    outlineStyle: 'none',
  } as object,
  mostrar: { minWidth: 44, minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  mostrarTexto: { fontFamily: fonts.bodyBold, fontSize: fontSizes.small, color: colors.accent },
  ayuda: { fontFamily: fonts.body, fontSize: fontSizes.caption + 1, lineHeight: 18, color: colors.textSecondary },
});
