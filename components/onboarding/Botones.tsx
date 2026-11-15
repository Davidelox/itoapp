import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, radius } from '@/constants/theme';

type PropsBoton = {
  etiqueta: string;
  onPress: () => void;
  /** Muestra el indicador y desactiva el botón; `etiquetaCargando` sustituye al texto («Creando…»). */
  cargando?: boolean;
  etiquetaCargando?: string;
  deshabilitado?: boolean;
};

/** Botón principal granate de 52 px, ancho completo. */
export function BotonPrincipal({ etiqueta, onPress, cargando = false, etiquetaCargando, deshabilitado = false }: PropsBoton) {
  const inactivo = deshabilitado || cargando;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cargando ? (etiquetaCargando ?? etiqueta) : etiqueta}
      accessibilityState={{ disabled: inactivo, busy: cargando }}
      disabled={inactivo}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: pressed ? colors.accentDark : colors.accent },
        inactivo && !cargando && styles.apagado,
      ]}
    >
      {cargando && <ActivityIndicator color={colors.white} size="small" />}
      <Text style={[styles.texto, { color: colors.white }]}>{cargando ? (etiquetaCargando ?? etiqueta) : etiqueta}</Text>
    </Pressable>
  );
}

/** Botón secundario: fondo `#EFEBE3`, texto oscuro. */
export function BotonSecundario({ etiqueta, onPress, deshabilitado = false }: PropsBoton) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: deshabilitado }}
      disabled={deshabilitado}
      onPress={onPress}
      style={({ pressed }) => [styles.base, { backgroundColor: pressed ? colors.segmented : colors.surface }, deshabilitado && styles.apagado]}
    >
      <Text style={[styles.texto, { color: colors.text }]}>{etiqueta}</Text>
    </Pressable>
  );
}

/** Enlace de texto de al menos 44 px de alto («¿Has olvidado tu contraseña?»). */
export function EnlaceTexto({ etiqueta, onPress, deshabilitado = false }: Omit<PropsBoton, 'cargando'>) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ disabled: deshabilitado }}
      disabled={deshabilitado}
      onPress={onPress}
      style={styles.enlace}
    >
      <Text style={[styles.textoEnlace, deshabilitado && { color: colors.textSecondary }]}>{etiqueta}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.full,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apagado: { opacity: 0.45 },
  texto: { fontFamily: fonts.bodyBold, fontSize: 16 },
  enlace: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  textoEnlace: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.accent },
});
