import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BotonNudo } from '@/components/hilo/BotonNudo';
import { HiloConector } from '@/components/hilo/HiloConector';
import { HiloSaldar } from '@/components/hilo/HiloSaldar';
import { SplashHilo } from '@/components/hilo/SplashHilo';
import { useTirarDelHilo } from '@/components/hilo/TirarDelHilo';
import { colors, fonts, fontSizes, radius, spacing } from '@/constants/theme';

const TARJETAS = [
  { id: 'cena', titulo: 'Cena en Taberna El Olivo', tipo: 'Gasto', detalle: '48,50 € · pagó David' },
  { id: 'sitio', titulo: 'Taberna El Olivo', tipo: 'Sitio', detalle: 'Calle Mayor 12 · guardado en el mapa' },
  { id: 'lisboa', titulo: '✈️ Escapada a Lisboa', tipo: 'Plan', detalle: '3 días · del 12 al 15 de marzo' },
];

export default function Laboratorio() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [splash, setSplash] = useState(false);
  const [saldado, setSaldado] = useState(false);
  const { tirar, overlay, reiniciar } = useTirarDelHilo();

  // Al volver del detalle, el hilo vuelve a recogerse.
  useFocusEffect(useCallback(() => reiniciar(), [reiniciar]));

  return (
    <View style={styles.pantalla}>
      <ScrollView
        contentContainerStyle={[styles.contenido, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + 48 }]}
      >
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.volver}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.titulo}>Laboratorio del hilo</Text>
        <Text style={styles.intro}>
          Aquí puedes probar cada animación de ito. Si tienes activado «Reducir movimiento», verás fundidos sencillos.
        </Text>

        <Seccion titulo="Pantalla de inicio" texto="El hilo entra, traza su tirabuzón sobre ito, sale por la derecha, vuelve por abajo y recorre la barra hasta Inicio, donde se tensa y se recoge. Tócala para saltarla.">
          <BotonSecundario label="Relanzar la animación" onPress={() => setSplash(true)} />
        </Seccion>

        <Seccion titulo="Botón con nudo" texto="Al pulsarlo, el hilo hace un nudo y confirma que se ha guardado.">
          <BotonNudo label="Guardar gasto" labelHecho="Guardado" />
        </Seccion>

        <Seccion titulo="Saldar cuentas" texto="Cuando lo saldáis, el nudo que os unía se deshace.">
          <HiloSaldar saldado={saldado} />
          <View style={styles.fila}>
            <View style={styles.flex}>
              <BotonNudo label="Saldar" labelHecho="Saldado" onPress={() => setSaldado(true)} />
            </View>
            <View style={styles.flex}>
              <BotonSecundario label="Reiniciar" onPress={() => setSaldado(false)} />
            </View>
          </View>
        </Seccion>

        <Seccion
          titulo="Tarjetas conectadas"
          texto="El hilo une lo que va junto. Toca una tarjeta para tirar del hilo y abrir su detalle."
        >
          <HiloConector>
            {TARJETAS.map((t) => (
              <Tarjeta
                key={t.id}
                tipo={t.tipo}
                titulo={t.titulo}
                detalle={t.detalle}
                onPress={(y) =>
                  tirar(y, () =>
                    router.push({
                      pathname: '/laboratorio/detalle',
                      params: { titulo: t.titulo, tipo: t.tipo, detalle: t.detalle },
                    }),
                  )
                }
              />
            ))}
          </HiloConector>
        </Seccion>
      </ScrollView>
      {overlay}
      {splash && <SplashHilo relanzada onDone={() => setSplash(false)} />}
    </View>
  );
}

function Seccion({ titulo, texto, children }: { titulo: string; texto: string; children: ReactNode }) {
  return (
    <View style={styles.seccion}>
      <Text style={styles.subtitulo}>{titulo}</Text>
      <Text style={styles.texto}>{texto}</Text>
      <View style={styles.cuerpo}>{children}</View>
    </View>
  );
}

function BotonSecundario({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.secundario, pressed && { backgroundColor: colors.segmented }]}
    >
      <Text style={styles.secundarioTexto}>{label}</Text>
    </Pressable>
  );
}

function Tarjeta({
  tipo,
  titulo,
  detalle,
  onPress,
}: {
  tipo: string;
  titulo: string;
  detalle: string;
  onPress: (yEnVentana: number) => void;
}) {
  const ref = useRef<ComponentRef<typeof Pressable>>(null);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      onPress={() => {
        if (!ref.current) return onPress(200);
        ref.current.measureInWindow((_x, y) => onPress(y));
      }}
      style={({ pressed }) => [styles.tarjeta, pressed && { backgroundColor: colors.surface }]}
    >
      <Text style={styles.tarjetaTipo}>{tipo}</Text>
      <Text style={styles.tarjetaTitulo}>{titulo}</Text>
      <Text style={styles.tarjetaDetalle}>{detalle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  contenido: { paddingHorizontal: spacing.xl, gap: spacing.xl },
  volver: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.body, color: colors.accent },
  titulo: { fontFamily: fonts.title, fontSize: fontSizes.title, color: colors.text },
  intro: { fontFamily: fonts.body, fontSize: fontSizes.body, color: colors.textSecondary, marginTop: -spacing.md },
  seccion: { gap: spacing.sm },
  subtitulo: { fontFamily: fonts.title, fontSize: 22, color: colors.text },
  texto: { fontFamily: fonts.body, fontSize: fontSizes.small, color: colors.textSecondary },
  cuerpo: { marginTop: spacing.sm, gap: spacing.lg },
  fila: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  secundario: {
    height: 52,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  secundarioTexto: { fontFamily: fonts.bodyBold, fontSize: fontSizes.body, color: colors.text },
  tarjeta: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 2,
  },
  tarjetaTipo: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: colors.accent },
  tarjetaTitulo: { fontFamily: fonts.title, fontSize: fontSizes.heading, color: colors.text },
  tarjetaDetalle: { fontFamily: fonts.body, fontSize: fontSizes.small, color: colors.textSecondary },
});
