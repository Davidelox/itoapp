import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { BotonNudo } from '@/components/hilo/BotonNudo';
import { Chip, FilaChips, Grupo, Interruptor } from '@/components/gastos/Controles';
import { SelectorUbicacion } from '@/components/mapa/SelectorUbicacion';
import { EnlaceTexto } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { Segmentado } from '@/components/onboarding/OpcionRadio';
import { colors, fonts, radius } from '@/constants/theme';
import { personas } from '@/lib/gastos/personas';
import { ErrorGasto } from '@/lib/gastos/error';
import { CATEGORIAS_SITIO, INFO_CATEGORIA_SITIO } from '@/lib/mapa/categorias';
import { PAUSA_BUSQUEDA_MS, type SitioBuscado, textoBuscable } from '@/lib/mapa/busqueda';
import { buscarSitios, crearSitio, sitioDeBusqueda } from '@/lib/mapa/consultas';
import { DELTA_MINIMO, encuadre } from '@/lib/mapa/encuadre';
import { ERROR_GENERICO } from '@/lib/mapa/error';
import { ETIQUETA_ESTADO } from '@/lib/mapa/lista';
import {
  type FormularioSitio,
  MAX_DIRECCION,
  MAX_NOMBRE,
  buscarDuplicado,
  coordenadasValidas,
  hayErroresSitio,
  validarSitio,
} from '@/lib/mapa/sitio';
import type { EstadoSitio, Sitio } from '@/lib/mapa/tipos';
import { useInvalidarMapa, useSitios } from '@/lib/mapa/useSitios';
import { type Pareja, useEstado } from '@/lib/pareja/EstadoProvider';

const PAUSA_NUDO_MS = 900;

type Modo = 'buscar' | 'mano';

/** Un número de un parámetro de ruta (`?lat=`), o null. */
const numero = (v: string | undefined) => (v !== undefined && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Guardar un sitio (docs/plan-mapa.md §5.3): buscándolo (Photon, fase 4) o a mano (cruz en el centro del mapa;
 * `?lat=&lng=` si se abre desde «mantener pulsado» en el mapa, y entonces arranca en modo «A mano»).
 */
export default function NuevoSitio() {
  const { pareja } = useEstado();
  if (!pareja) {
    return (
      <View style={[styles.raiz, styles.cargando]}>
        <CargandoHilo size="large" color={colors.accent} />
      </View>
    );
  }
  return <Formulario pareja={pareja} />;
}

function Formulario({ pareja }: { pareja: Pareja }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const invalidar = useInvalidarMapa();
  const { data: sitios = [] } = useSitios();
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const p = personas(pareja);

  // Punto de partida: el de «mantener pulsado»; si no, el encuadre de lo ya guardado (o España).
  const [inicial] = useState(() => {
    const lat = numero(params.lat);
    const lng = numero(params.lng);
    return coordenadasValidas(lat, lng)
      ? { latitude: lat, longitude: lng as number, latitudeDelta: DELTA_MINIMO, longitudeDelta: DELTA_MINIMO }
      : encuadre(sitios);
  });
  const [modo, setModo] = useState<Modo>(() => (coordenadasValidas(numero(params.lat), numero(params.lng)) ? 'mano' : 'buscar'));
  const [f, setF] = useState<FormularioSitio>({
    nombre: '',
    direccion: '',
    categoria: 'restaurant',
    estado: 'want_to_go',
    privado: false,
    lat: modo === 'mano' ? inicial.latitude : null,
    lng: modo === 'mano' ? inicial.longitude : null,
    lugarId: null,
  });
  const [escrito, setEscrito] = useState('');
  const [consulta, setConsulta] = useState<string | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current); }, []);
  const busqueda = useQuery({
    queryKey: ['mapa-busqueda', consulta],
    queryFn: () => buscarSitios(consulta as string, { lat: inicial.latitude, lng: inicial.longitude }),
    enabled: modo === 'buscar' && consulta !== null,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const escribir = (t: string) => {
    setEscrito(t);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setConsulta(textoBuscable(t)), PAUSA_BUSQUEDA_MS);
  };
  const elegir = (r: SitioBuscado) => {
    setElegido(r.provider_place_id);
    setF((x) => ({ ...x, nombre: r.nombre, direccion: r.direccion ?? '', categoria: r.categoria, lat: r.lat, lng: r.lng, lugarId: r.provider_place_id }));
  };
  const cambiarModo = (m: Modo) => {
    setModo(m);
    setElegido(null);
    setError(null);
    setDuplicado(null);
    setF((x) => ({ ...x, lugarId: null, lat: m === 'mano' ? inicial.latitude : null, lng: m === 'mano' ? inicial.longitude : null }));
  };
  const [intentado, setIntentado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicado, setDuplicado] = useState<Pick<Sitio, 'id' | 'name'> | null>(null);
  // Id fijado al abrir: reintentar tras un fallo de red no duplica el sitio.
  const [id] = useState(() => Crypto.randomUUID());
  const cambiar = (parcial: Partial<FormularioSitio>) => setF((x) => ({ ...x, ...parcial }));

  const errores = validarSitio(f);
  const visibles = intentado
    ? { ...errores, ubicacion: errores.ubicacion && modo === 'buscar' ? 'Elige un resultado de la búsqueda o cambia a «A mano».' : errores.ubicacion }
    : { nombre: null, ubicacion: null };

  const guardar = async () => {
    setIntentado(true);
    setDuplicado(null);
    if (hayErroresSitio(errores)) {
      setError(errores.nombre ?? errores.ubicacion);
      throw new Error('incompleto');
    }
    const repetido = buscarDuplicado(sitios, { nombre: f.nombre, lat: f.lat as number, lng: f.lng as number });
    if (repetido) {
      setDuplicado(repetido);
      setError('Ya está en vuestro mapa.');
      throw new Error('duplicado');
    }
    setError(null);
    try {
      await crearSitio(id, pareja.coupleId, f);
      await invalidar();
    } catch (e) {
      if (e instanceof ErrorGasto && e.codigo === '23505' && f.lugarId) {
        // Ya está guardado (lo compartió tu pareja o lo guardaste tú): se abre ese en vez de duplicarlo.
        const existente = await sitioDeBusqueda(f.lugarId).catch(() => null);
        if (existente) setDuplicado({ id: existente, name: f.nombre.trim() });
      }
      setError(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
      throw e;
    }
  };

  const abrirFicha = (sitioId: string) => router.replace({ pathname: '/mapa/sitio/[id]', params: { id: sitioId } });

  return (
    <KeyboardAvoidingView style={styles.raiz} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.cabecera, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={() => router.back()} style={styles.cerrar}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.titulo}>
          Guardar sitio
        </Text>
        <View style={styles.cerrarHueco} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.contenido}>
        <Segmentado<Modo>
          etiqueta="Cómo añadirlo"
          opciones={[
            { valor: 'buscar', etiqueta: 'Buscar' },
            { valor: 'mano', etiqueta: 'A mano' },
          ]}
          valor={modo}
          onCambiar={cambiarModo}
        />

        {modo === 'buscar' ? (
          <Grupo etiqueta="Buscar sitio">
            <TextInput
              accessibilityLabel="Buscar sitio"
              value={escrito}
              onChangeText={escribir}
              maxLength={100}
              placeholder="Nombre del sitio y ciudad"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={styles.campo}
            />
            {busqueda.isFetching ? (
              <View style={styles.estado} accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.nota}>Buscando…</Text>
              </View>
            ) : busqueda.isError ? (
              <MensajeError texto={busqueda.error instanceof ErrorGasto ? busqueda.error.message : ERROR_GENERICO} />
            ) : consulta === null ? (
              <Text style={styles.nota}>Escribe al menos 2 letras. Si no lo encuentras, usa «A mano».</Text>
            ) : busqueda.data && busqueda.data.length === 0 ? (
              <Text style={styles.nota}>No hay resultados. Prueba con otro nombre o usa «A mano».</Text>
            ) : null}
            {!busqueda.isFetching && busqueda.data
              ? busqueda.data.map((r) => (
                  <Pressable
                    key={r.provider_place_id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: elegido === r.provider_place_id }}
                    accessibilityLabel={`${r.nombre}${r.direccion ? `, ${r.direccion}` : ''}`}
                    onPress={() => elegir(r)}
                    style={[styles.resultado, elegido === r.provider_place_id && styles.resultadoActivo]}
                  >
                    <Ionicons name={INFO_CATEGORIA_SITIO[r.categoria].icono} size={20} color={colors.accent} />
                    <View style={styles.resultadoTexto}>
                      <Text style={styles.resultadoNombre} numberOfLines={1}>{r.nombre}</Text>
                      {r.direccion ? <Text style={styles.nota} numberOfLines={1}>{r.direccion}</Text> : null}
                    </View>
                  </Pressable>
                ))
              : null}
            <Text style={styles.nota}>Datos © OpenStreetMap</Text>
            <MensajeError texto={visibles.ubicacion} />
          </Grupo>
        ) : null}

        <Grupo etiqueta="Nombre">
          <TextInput
            accessibilityLabel="Nombre"
            value={f.nombre}
            onChangeText={(t) => cambiar({ nombre: t })}
            maxLength={MAX_NOMBRE}
            placeholder="Taberna El Olivo, mirador, hotel…"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="sentences"
            returnKeyType="done"
            style={styles.campo}
          />
          <MensajeError texto={visibles.nombre} />
        </Grupo>

        <Grupo etiqueta="Dirección (opcional)">
          <TextInput
            accessibilityLabel="Dirección"
            value={f.direccion}
            onChangeText={(t) => cambiar({ direccion: t })}
            maxLength={MAX_DIRECCION}
            placeholder="Calle Mayor 12, Madrid"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="sentences"
            returnKeyType="done"
            style={styles.campo}
          />
        </Grupo>

        <Grupo etiqueta="Categoría" rol="radiogroup">
          <FilaChips>
            {CATEGORIAS_SITIO.map((c) => (
              <Chip key={c} rol="radio" etiqueta={INFO_CATEGORIA_SITIO[c].etiqueta} icono={INFO_CATEGORIA_SITIO[c].icono} activo={f.categoria === c} onPress={() => cambiar({ categoria: c })} />
            ))}
          </FilaChips>
        </Grupo>

        <Grupo etiqueta="Estado">
          <Segmentado<EstadoSitio>
            etiqueta="Estado"
            opciones={(['want_to_go', 'been'] as const).map((valor) => ({ valor, etiqueta: ETIQUETA_ESTADO[valor] }))}
            valor={f.estado}
            onCambiar={(estado) => cambiar({ estado })}
          />
        </Grupo>

        {p.otra ? (
          <Interruptor
            titulo="Privado, solo para ti"
            ayuda={`${p.nombrePareja} no lo verá. Ideal para sorpresas. Más adelante puedes revelarlo, pero no volver a ocultarlo.`}
            valor={f.privado}
            onCambiar={(privado) => cambiar({ privado })}
          />
        ) : null}

        {modo === 'mano' ? (
          <Grupo etiqueta="Ubicación">
            <SelectorUbicacion inicial={inicial} onCambiar={(lat, lng) => cambiar({ lat, lng })} />
            <MensajeError texto={visibles.ubicacion} />
          </Grupo>
        ) : null}

        <MensajeError texto={error} />
        {duplicado ? <EnlaceTexto etiqueta={`Abrir «${duplicado.name}»`} onPress={() => abrirFicha(duplicado.id)} /> : null}
      </ScrollView>

      <View style={[styles.pie, { paddingBottom: insets.bottom + 16 }]}>
        <BotonNudo label="Guardar sitio" labelHecho="Guardado" labelError="No se ha podido guardar" onPress={guardar} onHecho={() => setTimeout(() => abrirFicha(id), PAUSA_NUDO_MS)} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colors.background },
  cargando: { alignItems: 'center', justifyContent: 'center' },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  cerrar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cerrarHueco: { width: 44 },
  titulo: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  contenido: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, gap: 14 },
  campo: { height: 50, paddingHorizontal: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.white, fontFamily: fonts.body, fontSize: 16, color: colors.text },
  estado: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nota: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  resultado: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  resultadoActivo: { borderColor: colors.accent, borderWidth: 2 },
  resultadoTexto: { flex: 1 },
  resultadoNombre: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  pie: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
});
