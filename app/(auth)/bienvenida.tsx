import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BotonPrincipal, EnlaceTexto } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, spacing } from '@/constants/theme';
import { useSesion } from '@/lib/auth/SesionProvider';
import { ETIQUETA_PROVEEDOR, PROVEEDORES_SOCIALES, entrarConProveedor } from '@/lib/auth/proveedores';

export default function Bienvenida() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { aviso, descartarAviso } = useSesion();
  const [errorProveedor, setErrorProveedor] = useState<string | null>(null);

  return (
    <View style={[styles.pantalla, { paddingTop: insets.top + 56, paddingBottom: Math.max(insets.bottom, spacing.xl) }]}>
      <View style={styles.centro}>
        <Text accessibilityRole="header" style={styles.logo}>
          ito
        </Text>
        <Text style={styles.lema}>No perdais el hilo<br></br>de vuestro plan</Text>
        <Text style={styles.descripcion}>
          Gastos, calendario, lugares de interés y viajes compartidos en un solo espacio.
        </Text>
      </View>

      <View style={styles.acciones}>
        {aviso ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${aviso} Cerrar aviso`} onPress={descartarAviso}>
            <MensajeError texto={aviso} />
          </Pressable>
        ) : null}
        {/* Hueco para Apple y Google: la lista está vacía hasta que se implementen (lib/auth/proveedores.ts). */}
        {PROVEEDORES_SOCIALES.map((p) => (
          <Pressable
            key={p}
            accessibilityRole="button"
            onPress={async () => {
              const r = await entrarConProveedor(p);
              setErrorProveedor(r.ok ? null : r.mensaje);
            }}
            style={styles.social}
          >
            <Text style={styles.socialTexto}>{ETIQUETA_PROVEEDOR[p]}</Text>
          </Pressable>
        ))}
        <MensajeError texto={errorProveedor} />
        <BotonPrincipal etiqueta="Usar mi email" onPress={() => router.push('/crear-cuenta')} />
        <EnlaceTexto etiqueta="Ya tengo cuenta" onPress={() => router.push('/entrar')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  logo: { fontFamily: fonts.brand, fontSize: 96, lineHeight: 110, color: colors.accent },
  lema: { fontFamily: fonts.title, fontSize: 22, color: colors.text, textAlign: 'center' },
  descripcion: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  acciones: { gap: spacing.md },
  social: {
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialTexto: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
});
