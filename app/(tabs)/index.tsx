import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BotonPrincipal, EnlaceTexto } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { TarjetasPendientes } from '@/components/inicio/TarjetasPendientes';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { cerrarSesion } from '@/lib/auth/acciones';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { salirDelEspacio } from '@/lib/pareja/acciones';

export default function Screen() {
  const router = useRouter();
  const { pareja } = useEstado();
  return (
    <PlaceholderScreen title="Inicio">
      <TarjetasPendientes />
      {pareja && pareja.otra === null ? (
        <View style={styles.aviso}>
          <Text style={styles.avisoTitulo}>Tu pareja aún no se ha unido</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/pareja/invitar')}
            style={styles.avisoBoton}
          >
            <Text style={styles.avisoEnlace}>Ver código</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/laboratorio')}
        style={({ pressed }) => [styles.boton, pressed && styles.pulsado]}
      >
        <Text style={styles.texto}>Ver animaciones del hilo</Text>
      </Pressable>
      <SalirDelEspacio />
      {/* Provisional: irá en Ajustes. Cierra solo la sesión de este dispositivo. */}
      <Pressable accessibilityRole="button" onPress={() => cerrarSesion()} style={styles.cerrar}>
        <Text style={styles.cerrarTexto}>Cerrar sesión</Text>
      </Pressable>
    </PlaceholderScreen>
  );
}

/**
 * Provisional (irá en Ajustes → Pareja). Si no queda nadie, el servidor borra el espacio entero (leave_couple):
 * sirve también para repetir el primer uso sin crear cuentas nuevas.
 */
function SalirDelEspacio() {
  const { pareja, refrescar } = useEstado();
  const [confirmando, setConfirmando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!pareja) return null;

  const otra = pareja.otra ? pareja.otra.nombre.trim() || 'Tu pareja' : null;
  const salir = async () => {
    setError(null);
    setSaliendo(true);
    const r = await salirDelEspacio();
    if (!r.ok) {
      setSaliendo(false);
      setError(r.mensaje);
      return;
    }
    // La fase pasa a «sin pareja» y la guarda lleva a «Vuestro espacio».
    await refrescar();
  };

  if (!confirmando) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setConfirmando(true)} style={styles.cerrar}>
        <Text style={styles.cerrarTexto}>{otra ? 'Salir del espacio' : 'Eliminar el espacio'}</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.confirmacion}>
      <Text style={styles.confirmacionTexto}>
        {otra
          ? `Saldrás del espacio y ${otra} seguirá dentro. Se borrará lo que sea solo tuyo y privado. Para volver, ${otra} tendrá que darte un código nuevo.`
          : 'Se borrará vuestro espacio con todo lo que tenga. Después podrás crear otro o unirte con un código.'}
      </Text>
      <MensajeError texto={error} />
      <BotonPrincipal
        etiqueta={otra ? 'Sí, salir' : 'Sí, eliminar'}
        etiquetaCargando="Un momento…"
        cargando={saliendo}
        onPress={salir}
      />
      <EnlaceTexto etiqueta="Cancelar" onPress={() => setConfirmando(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  aviso: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avisoTitulo: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  avisoBoton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  avisoEnlace: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.accent },
  boton: {
    marginTop: spacing.xl,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulsado: { backgroundColor: colors.accentDark },
  texto: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.white },
  cerrar: { marginTop: spacing.md, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cerrarTexto: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.textSecondary },
  confirmacion: {
    marginTop: spacing.md,
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmacionTexto: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
});
