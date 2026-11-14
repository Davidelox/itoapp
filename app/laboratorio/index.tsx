import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BotonNudo } from '@/components/hilo/BotonNudo';
import { HiloConector } from '@/components/hilo/HiloConector';
import { HiloSaldar } from '@/components/hilo/HiloSaldar';
import { SplashHilo } from '@/components/hilo/SplashHilo';
import { TarjetaConectada } from '@/components/hilo/TarjetaConectada';
import { type RectHilo, useTirarDelHilo } from '@/components/hilo/TirarDelHilo';
import { colors, fonts, fontSizes, radius, spacing } from '@/constants/theme';

const TARJETAS = [
  { id: 'cena', titulo: 'Cena en Taberna El Olivo', tipo: 'Gasto', detalle: '48,50 € · pagó David' },
  { id: 'sitio', titulo: 'Taberna El Olivo', tipo: 'Sitio', detalle: 'Calle Mayor 12 · guardado en el mapa' },
  { id: 'lisboa', titulo: '✈️ Escapada a Lisboa', tipo: 'Plan', detalle: '3 días · del 12 al 15 de marzo' },
];

/** Simula un guardado que tarda. */
const esperar = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

export default function Laboratorio() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [splash, setSplash] = useState(false);
  const [saldado, setSaldado] = useState(false);
  const { tirar, overlay, alVolver, claveActiva } = useTirarDelHilo();
  // El hilo que cose las tarjetas se mece un poco al desplazar la pantalla.
  const desplazamiento = useSharedValue(0);
  const alDesplazar = useAnimatedScrollHandler((e) => {
    desplazamiento.value = e.contentOffset.y;
  });

  // Al volver del detalle, el hilo devuelve la tarjeta a su sitio.
  useFocusEffect(useCallback(() => alVolver(), [alVolver]));

  return (
    <View style={styles.pantalla}>
      <Animated.ScrollView
        onScroll={alDesplazar}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.contenido, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + 48 }]}
      >
        <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12}>
          <Text style={styles.volver}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.titulo}>Laboratorio del hilo</Text>
        <Text style={styles.intro}>
          Aquí puedes probar cada animación de ito. Si tienes activado «Reducir movimiento», verás fundidos sencillos.
        </Text>

        <Seccion titulo="Pantalla de inicio" texto="El hilo entra, traza su tirabuzón sobre ito, sale por la derecha, vuelve por abajo y recorre la barra hasta Inicio, donde se tensa y se recoge. Tócala para saltarla.">
          <BotonSecundario label="Relanzar la animación" onPress={() => setSplash(true)} />
        </Seccion>

        <Seccion
          titulo="Botón con nudo"
          texto="Al pulsarlo, el hilo cruza el botón, se anuda y se aprieta para confirmar. Si el guardado tarda, el nudo espera abierto; si falla, se suelta."
        >
          <BotonNudo label="Guardar gasto" labelHecho="Guardado" />
          <BotonNudo label="Guardar (tarda 2 s)" labelHecho="Guardado" onPress={() => esperar(2000)} />
          <BotonNudo
            label="Guardar (falla)"
            labelError="No se ha podido guardar"
            onPress={() => esperar(1300).then(() => Promise.reject(new Error('Fallo de prueba')))}
          />
        </Seccion>

        <Seccion titulo="Saldar cuentas" texto="Cuando lo saldáis, el nudo que os unía se deshace.">
          <HiloSaldar saldado={saldado} />
          <View style={styles.fila}>
            <View style={styles.flex}>
              <BotonNudo label="Saldar" labelHecho="Saldado" onHecho={() => setSaldado(true)} />
            </View>
            <View style={styles.flex}>
              <BotonSecundario label="Reiniciar" onPress={() => setSaldado(false)} />
            </View>
          </View>
        </Seccion>

        <Seccion
          titulo="Tarjetas conectadas"
          texto="El hilo cose lo que va junto. Toca una tarjeta: el hilo tira de ella y la sube hasta su detalle; al volver, la devuelve a su sitio."
        >
          <HiloConector desplazamiento={desplazamiento}>
            {TARJETAS.map((t) => (
              <Tarjeta
                key={t.id}
                tipo={t.tipo}
                titulo={t.titulo}
                detalle={t.detalle}
                oculta={claveActiva === t.id}
                onPress={(origen) =>
                  tirar({
                    clave: t.id,
                    origen,
                    contenido: (
                      <TarjetaConectada tipo={t.tipo} titulo={t.titulo} detalle={t.detalle} style={styles.flex} />
                    ),
                    ir: () =>
                      router.push({
                        pathname: '/laboratorio/detalle',
                        params: { titulo: t.titulo, tipo: t.tipo, detalle: t.detalle },
                      }),
                  })
                }
              />
            ))}
          </HiloConector>
        </Seccion>
      </Animated.ScrollView>
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
  oculta,
  onPress,
}: {
  tipo: string;
  titulo: string;
  detalle: string;
  /** Mientras el hilo la lleva al detalle, la tarjeta de la lista no se ve (la sustituye la que viaja). */
  oculta: boolean;
  onPress: (enVentana: RectHilo) => void;
}) {
  const ref = useRef<ComponentRef<typeof Pressable>>(null);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={`${tipo}: ${titulo}. ${detalle}`}
      onPress={() => ref.current?.measureInWindow((x, y, width, height) => onPress({ x, y, width, height }))}
      style={({ pressed }) => [oculta && styles.oculta, pressed && styles.tarjetaPulsada]}
    >
      <TarjetaConectada tipo={tipo} titulo={titulo} detalle={detalle} />
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
  oculta: { opacity: 0 },
  tarjetaPulsada: { transform: [{ scale: 0.985 }] },
});
