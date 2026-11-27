import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { EmojiIcono } from '@/components/mapa/EmojiIcono';
import { BotonSecundario } from '@/components/onboarding/Botones';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { useSolicitudBorrado } from '@/lib/gastos/useGastos';
import { contarSitios, esDePlan, textoContadorSitios } from '@/lib/mapa/colecciones';
import type { Coleccion } from '@/lib/mapa/tipos';
import { useColecciones, usePertenencias } from '@/lib/mapa/useSitios';

/** «Mis colecciones»: todas las que ves, con su icono y cuántos sitios tienen. Tocar una abre su detalle (sus sitios; desde ahí se edita). */
export default function MisColecciones() {
  const colors = useColores();
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colecciones = useColecciones();
  const pertenencias = usePertenencias();
  const cuentas = contarSitios(pertenencias.data ?? []);
  const lista = colecciones.data ?? [];
  const volver = () => (router.canGoBack() ? router.back() : router.replace('/mapa'));
  const nueva = () => router.push('/mapa/coleccion/nueva');

  return (
    <View style={styles.raiz}>
      <View style={[styles.cabecera, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={volver} style={styles.redondo}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.titulo}>
          Mis colecciones
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Nueva colección" onPress={nueva} style={styles.redondo}>
          <Ionicons name="add" size={24} color={colors.text} />
        </Pressable>
      </View>
      {colecciones.isLoading ? (
        <CargandoHilo size="large" color={colors.accent} style={{ marginTop: 40 }} />
      ) : colecciones.isError && !colecciones.data ? (
        <View style={styles.centro}>
          <Text style={styles.texto}>No se han podido cargar las colecciones.</Text>
          <BotonSecundario etiqueta="Reintentar" onPress={() => colecciones.refetch()} />
        </View>
      ) : lista.length === 0 ? (
        <View style={styles.centro}>
          <Text style={styles.vacioTitulo}>Aún no hay colecciones</Text>
          <Text style={styles.texto}>Agrupa vuestros sitios: «Ramen», «Escapadas», «Planes de lluvia»…</Text>
          <BotonSecundario etiqueta="Crear colección" onPress={nueva} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 24 }]}>
          {lista.map((c, i) => (
            <FilaColeccion key={c.id} coleccion={c} sitios={cuentas.get(c.id) ?? 0} separador={i < lista.length - 1} onPress={() => router.push({ pathname: '/mapa/coleccion/[id]', params: { id: c.id } })} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function FilaColeccion({ coleccion, sitios, separador, onPress }: { coleccion: Coleccion; sitios: number; separador: boolean; onPress: () => void }) {
  const colors = useColores();
  const styles = useStyles();
  const solicitud = useSolicitudBorrado(coleccion.id, 'collection');
  const detalle = [
    textoContadorSitios(sitios),
    esDePlan(coleccion) ? 'de un plan' : null,
    !coleccion.visible_to_partner ? 'privada' : null,
    solicitud.data ? 'borrado pendiente' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${coleccion.name}, ${detalle}`}
      accessibilityHint="Abre la colección"
      onPress={onPress}
      style={({ pressed }) => [styles.fila, separador && styles.separador, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.emoji}>
        <EmojiIcono emoji={coleccion.icon} size={24} />
      </View>
      <View style={styles.textos}>
        <Text style={styles.nombre} numberOfLines={2}>
          {coleccion.name}
        </Text>
        <Text style={styles.linea}>{detalle}</Text>
      </View>
      {!coleccion.visible_to_partner ? <Ionicons name="lock-closed" size={16} color={colors.textSecondary} /> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const useStyles = crearEstilos((colors) => ({
  raiz: { flex: 1, backgroundColor: colors.background },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  redondo: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  contenido: { paddingHorizontal: 20, paddingTop: 8 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32, paddingBottom: 60 },
  vacioTitulo: { fontFamily: fonts.title, fontSize: 22, color: colors.text, textAlign: 'center' },
  texto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary, textAlign: 'center' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10 },
  separador: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  emoji: { width: 44, height: 44, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  textos: { flex: 1, minWidth: 0, gap: 2 },
  nombre: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  linea: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
}));
