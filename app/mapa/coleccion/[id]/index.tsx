import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { personas } from '@/lib/gastos/personas';
import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { EmojiIcono } from '@/components/mapa/EmojiIcono';
import { FilaSitio } from '@/components/mapa/FilaSitio';
import { HojaAnadirSitios } from '@/components/mapa/HojaAnadirSitios';
import { HAY_MAPA, MapaSitios } from '@/components/mapa/MapaSitios';
import { TarjetaSitio } from '@/components/mapa/TarjetaSitio';
import { BotonSecundario } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { Segmentado } from '@/components/onboarding/OpcionRadio';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { ErrorGasto } from '@/lib/gastos/error';
import { esDePlan, sitiosAnadibles, sitiosDeColeccion, textoContadorSitios, textoQuienComparte } from '@/lib/mapa/colecciones';
import { quitarSitioDeColeccion } from '@/lib/mapa/consultasColecciones';
import { ERROR_GENERICO } from '@/lib/mapa/error';
import { agruparLista } from '@/lib/mapa/lista';
import { useColecciones, useInvalidarMapa, usePertenencias, useSitios, useSitiosConPlan } from '@/lib/mapa/useSitios';
import { useEstado } from '@/lib/pareja/EstadoProvider';

type Vista = 'lista' | 'mapa';

/** Detalle de una colección: cabecera, contador y sus sitios en [Lista | Mapa] (en web, solo la Lista). «Editar» abre el formulario. */
export default function DetalleColeccion() {
  const colors = useColores();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pareja, userId } = useEstado();
  const colecciones = useColecciones();
  const pertenencias = usePertenencias();
  const sitios = useSitios();
  const conPlan = useSitiosConPlan();
  const invalidar = useInvalidarMapa();
  const [vista, setVista] = useState<Vista>('lista');
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [anadiendo, setAnadiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idsConPlan = useMemo(() => new Set(conPlan.data ?? []), [conPlan.data]);

  const coleccion = colecciones.data?.find((c) => c.id === id);
  const volver = () => (router.canGoBack() ? router.back() : router.replace('/mapa/colecciones'));
  const cabecera = (accion?: React.ReactNode) => (
    <View style={[styles.cabecera, { paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={volver} style={styles.redondo}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      {accion ?? <View style={styles.redondo} />}
    </View>
  );

  if (!pareja || colecciones.isLoading || sitios.isLoading || pertenencias.isLoading) {
    return (
      <View style={styles.raiz}>
        {cabecera()}
        <CargandoHilo size="large" color={colors.accent} style={{ marginTop: 40 }} />
      </View>
    );
  }
  if (!coleccion) {
    // Borrada (aquí o por la pareja) o que esta persona ya no ve.
    return colecciones.isError && !colecciones.data ? (
      <View style={styles.raiz}>
        {cabecera()}
        <View style={styles.centro}>
          <Text style={styles.texto}>No se ha podido cargar la colección.</Text>
          <BotonSecundario etiqueta="Reintentar" onPress={() => colecciones.refetch()} />
        </View>
      </View>
    ) : (
      <Redirect href="/mapa/colecciones" />
    );
  }

  const p = personas(pareja, colors);
  const todos = sitios.data ?? [];
  const dentro = sitiosDeColeccion(coleccion.id, todos, pertenencias.data ?? []);
  const faltan = sitiosAnadibles(coleccion.id, todos, pertenencias.data ?? []);
  const soloLectura = esDePlan(coleccion);
  const conMapa = HAY_MAPA && Platform.OS !== 'web';
  const enMapa = conMapa && vista === 'mapa' && dentro.length > 0;
  const emojis = new Map(dentro.map((s) => [s.id, coleccion.icon]));
  const elegido = enMapa ? dentro.find((s) => s.id === seleccionado) : undefined;
  const abrir = (sitioId: string) => router.push({ pathname: '/mapa/sitio/[id]', params: { id: sitioId } });
  const quitar = async (sitioId: string) => {
    setError(null);
    try {
      await quitarSitioDeColeccion(coleccion.id, sitioId, pareja.coupleId);
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
    }
    await invalidar();
  };

  const encabezado = (
    <View style={styles.hero}>
      <View style={styles.emoji}>
        <EmojiIcono emoji={coleccion.icon} size={34} />
      </View>
      <View style={styles.heroTextos}>
        <Text accessibilityRole="header" style={styles.titulo} numberOfLines={3}>
          {coleccion.name}
        </Text>
        <Text style={styles.linea}>
          {textoQuienComparte(coleccion, userId ?? undefined, p.otra ? p.nombrePareja : null)} · {textoContadorSitios(dentro.length)}
        </Text>
      </View>
    </View>
  );
  const barra = (
    <View style={styles.barra}>
      {conMapa && dentro.length > 0 ? (
        <Segmentado
          compacto
          etiqueta="Vista de la colección"
          opciones={[
            { valor: 'lista', etiqueta: 'Lista' },
            { valor: 'mapa', etiqueta: 'Mapa' },
          ]}
          valor={vista}
          onCambiar={(v) => {
            setSeleccionado(null);
            setVista(v);
          }}
        />
      ) : null}
      {!soloLectura && faltan.length > 0 && dentro.length > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Añadir sitios" onPress={() => setAnadiendo(true)} hitSlop={6} style={styles.anadir}>
          <Ionicons name="add" size={18} color={colors.accent} />
          <Text style={styles.anadirTexto}>Añadir sitios</Text>
        </Pressable>
      ) : null}
    </View>
  );

  let cuerpo;
  if (dentro.length === 0) {
    cuerpo = (
      <View style={styles.centro}>
        <EmojiIcono emoji={coleccion.icon} size={48} />
        <Text accessibilityRole="header" style={styles.vacioTitulo}>
          Aún no hay sitios aquí
        </Text>
        <Text style={styles.texto}>
          {soloLectura
            ? 'Los sitios de esta colección los pone el plan.'
            : faltan.length > 0
              ? 'Añade sitios que ya tengáis guardados, o márcala al guardar uno nuevo.'
              : 'Guarda un sitio en el mapa y añádelo a esta colección desde su ficha.'}
        </Text>
        {!soloLectura && faltan.length > 0 ? <BotonSecundario etiqueta="Añadir sitios" onPress={() => setAnadiendo(true)} /> : null}
      </View>
    );
  } else if (enMapa) {
    cuerpo = (
      <View style={styles.mapa}>
        <MapaSitios sitios={dentro} conPlan={idsConPlan} emojis={emojis} seleccionado={elegido?.id ?? null} onSeleccionar={setSeleccionado} />
        {elegido ? <TarjetaSitio sitio={elegido} pareja={pareja} emoji={coleccion.icon} onFicha={() => abrir(elegido.id)} onCerrar={() => setSeleccionado(null)} /> : null}
      </View>
    );
  } else {
    cuerpo = (
      <ScrollView contentContainerStyle={[styles.lista, { paddingBottom: insets.bottom + 24 }]}>
        <MensajeError texto={error} />
        {agruparLista(dentro).map((g) => (
          <View key={g.estado} style={styles.grupo}>
            <Text accessibilityRole="header" style={styles.grupoTitulo}>
              {g.titulo}
            </Text>
            {g.sitios.map((s, i) => (
              <View key={s.id} style={styles.filaConQuitar}>
                <View style={styles.filaSitio}>
                  <FilaSitio sitio={s} pareja={pareja} emoji={coleccion.icon} separador={i < g.sitios.length - 1} onPress={() => abrir(s.id)} />
                </View>
                {!soloLectura ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar ${s.name} de la colección`}
                    accessibilityHint="El sitio sigue guardado"
                    onPress={() => quitar(s.id)}
                    hitSlop={4}
                    style={styles.quitar}
                  >
                    <Ionicons name="remove-circle-outline" size={22} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.raiz}>
      {cabecera(
        soloLectura ? undefined : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Editar colección"
            onPress={() => router.push({ pathname: '/mapa/coleccion/[id]/editar', params: { id: coleccion.id } })}
            style={styles.editar}
          >
            <Text style={styles.editarTexto}>Editar</Text>
          </Pressable>
        ),
      )}
      {encabezado}
      {barra}
      {cuerpo}
      {anadiendo ? <HojaAnadirSitios coleccion={coleccion} coupleId={pareja.coupleId} sitios={faltan} onCerrar={() => setAnadiendo(false)} /> : null}
    </View>
  );
}

const useStyles = crearEstilos((colors) => ({
  raiz: { flex: 1, backgroundColor: colors.background },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 4 },
  redondo: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  editar: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  editarTexto: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.accent },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingBottom: 12 },
  emoji: { width: 64, height: 64, borderRadius: radius.xl - 4, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  heroTextos: { flex: 1, minWidth: 0, gap: 2 },
  titulo: { fontFamily: fonts.title, fontSize: 26, color: colors.text },
  linea: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  barra: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingBottom: 8 },
  anadir: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, paddingHorizontal: 8 },
  anadirTexto: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.accent },
  mapa: { flex: 1 },
  lista: { paddingHorizontal: 20, paddingTop: 8, gap: 20 },
  grupo: { gap: 2 },
  grupoTitulo: { fontFamily: fonts.title, fontSize: 18, color: colors.text, marginBottom: 2 },
  filaConQuitar: { flexDirection: 'row', alignItems: 'center' },
  filaSitio: { flex: 1, minWidth: 0 },
  quitar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32, paddingBottom: 60 },
  vacioTitulo: { fontFamily: fonts.title, fontSize: 22, color: colors.text, textAlign: 'center' },
  texto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary, textAlign: 'center' },
}));
