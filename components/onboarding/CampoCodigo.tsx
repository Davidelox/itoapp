import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { MensajeError } from '@/components/onboarding/MensajeError';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos } from '@/lib/tema';
import { formatearCodigo } from '@/lib/pareja/codigo';

type Props = {
  etiqueta: string;
  valor: string;
  onCambiar: (nuevo: string) => void;
  /** `otp`: de 6 a 10 cifras del email. `invitacion`: 6 caracteres que se ven como `4K7·Q2X`. */
  tipo: 'otp' | 'invitacion';
  error?: string | null;
  editable?: boolean;
  autoFocus?: boolean;
};

/** Un solo campo (no 6 cajas): se lee mejor con lector de pantalla y se puede pegar. */
export function CampoCodigo({ etiqueta, valor, onCambiar, tipo, error, editable = true, autoFocus }: Props) {
  const styles = useStyles();
  const [enfocado, setEnfocado] = useState(false);
  const esOtp = tipo === 'otp';
  return (
    <View style={styles.grupo}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <TextInput
        accessibilityLabel={etiqueta}
        value={esOtp ? valor : formatearCodigo(valor)}
        onChangeText={(t) => onCambiar(esOtp ? t.replace(/\D/g, '').slice(0, 10) : formatearCodigo(t))}
        editable={editable}
        autoFocus={autoFocus}
        autoCapitalize={esOtp ? 'none' : 'characters'}
        autoCorrect={false}
        spellCheck={false}
        keyboardType={esOtp ? 'number-pad' : 'default'}
        textContentType={esOtp ? 'oneTimeCode' : 'none'}
        autoComplete={esOtp ? 'one-time-code' : 'off'}
        maxLength={esOtp ? 10 : 7}
        onFocus={() => setEnfocado(true)}
        onBlur={() => setEnfocado(false)}
        maxFontSizeMultiplier={1.3}
        style={[styles.entrada, enfocado && styles.enfocado, !!error && styles.conError]}
      />
      <MensajeError texto={error} />
    </View>
  );
}

const useStyles = crearEstilos((colors) => ({
  grupo: { gap: 6 },
  etiqueta: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  entrada: {
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.card,
    textAlign: 'center',
    fontFamily: fonts.bodyBold,
    fontSize: 30,
    letterSpacing: 6,
    color: colors.text,
    paddingHorizontal: 12,
    outlineStyle: 'none',
  } as object,
  enfocado: { borderColor: colors.text, borderWidth: 1.5 },
  conError: { borderColor: colors.error, borderWidth: 1.5 },
}));
