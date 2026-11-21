import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BorrarGasto } from '@/components/gastos/BorrarGasto';
import { HojaConfirmar } from '@/components/gastos/HojaConfirmar';
import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { HojaColecciones } from '@/components/mapa/HojaColecciones';
import { HojaComoLlegar } from '@/components/mapa/HojaComoLlegar';
import { HojaEditarSitio } from '@/components/mapa/HojaEditarSitio';
import { HojaVisita } from '@/components/mapa/HojaVisita';
import { EmojiIcono } from '@/components/mapa/EmojiIcono';
import { AVISO_VALORAR, HojaValoracion } from '@/components/mapa/HojaValoracion';
import { MiniMapa } from '@/components/mapa/MiniMapa';
import { ValoracionesPareja } from '@/components/mapa/Valoraciones';
import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { BotonPrincipal, BotonSecundario } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { Segmentado } from '@/components/onboarding/OpcionRadio';
import { colors, fonts, personColors, radius } from '@/constants/theme';
import { formatearImporte } from '@/lib/dinero/importe';
import { hoyISO } from '@/lib/gastos/fechas';
import { ErrorGasto } from '@/lib/gastos/error';
import { personas } from '@/lib/gastos/personas';
import { INFO_CATEGORIA_SITIO } from '@/lib/mapa/categorias';
import { type Seleccion, coleccionesDeSitio } from '@/lib/mapa/colecciones';
import { paramsPlanearAqui } from '@/lib/mapa/conexiones';
import { anadirVisita, editarSitio, quitarVisita } from '@/lib/mapa/consultas';
import { ERROR_GENERICO } from '@/lib/mapa/error';
import { ETIQUETA_ESTADO, quienGuardo } from '@/lib/mapa/lista';
import { urlGoogleMaps } from '@/lib/mapa/sitio';
import type { EstadoSitio } from '@/lib/mapa/tipos';
import { diaCorto, miNota, puedeValorar, textoEstadisticas } from '@/lib/mapa/valoracion';
import { useColecciones, useEstadisticasSitio, useInvalidarMapa, usePertenencias, usePlanesDeSitio, useSitio, useVisitasSitio } from '@/lib/mapa/useSitios';
import { type Visita, fechaSugerida, fechaVisita, gastoDelDia, ordenarVisitas, pedirFechaAlMarcar, textoContadorVisitas, textoUltimaVisita } from '@/lib/mapa/visitas';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/** Ficha de un sitio (docs/plan-mapa.md §5.3): estado, «Cómo llegar», «Ver en Google Maps», editar y pedir borrar. */
export default function FichaSitio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pareja } = useEstado();
  const { sitio, isLoading, isError } = useSitio(id);
  const invalidar = useInvalidarMapa();
  const [editando, setEditando] = useState(false);
  const [llegar, setLlegar] = useState(false);
  const [valorando, setValorando] = useState(false);
  const [coleccionando, setColeccionando] = useState(false);
  const colecciones = useColecciones();
  const pertenencias = usePertenencias();
  const estadisticas = useEstadisticasSitio(id);
  const planes = usePlanesDeSitio(id);
  const visitas = useVisitasSitio(id);
  // Hoja de visita abierta: nueva (con su título y, si se sugiere, su fecha) o corrigiendo una; y la que se va a quitar.
  const [hojaVisita, setHojaVisita] = useState<{ titulo: string; fecha?: string; visita?: Visita } | null>(null);
  const [quitando, setQuitando] = useState<Visita | null>(null);
  const [quitandoOcupado, setQuitandoOcupado] = useState(false);
  const [errorQuitar, setErrorQuitar] = useState<string | null>(null);
  // El estado elegido se ve al momento; vuelve a lo guardado cuando el servidor responde.
  const [estadoPendiente, setEstadoPendiente] = useState<EstadoSitio | null>(null);
  const [error, setError] = useState<string | null>(null);

  const volver = () => (router.canGoBack() ? router.back() : router.replace('/mapa'));
  const cabecera = (
    <View style={[styles.cabecera, { paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={volver} style={styles.redondo}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.tituloCabecera}>
        Sitio
      </Text>
      {sitio ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Editar sitio" onPress={() => setEditando(true)} style={styles.redondo}>
          <Ionicons name="create-outline" size={22} color={colors.text} />
        </Pressable>
      ) : (
        <View style={styles.redondo} />
      )}
    </View>
  );

  if (!pareja || isLoading) {
    return (
      <View style={styles.raiz}>
        {cabecera}
        <CargandoHilo size="large" color={colors.accent} style={{ marginTop: 40 }} />
      </View>
    );
  }
  if (!sitio) {
    return (
      <View style={styles.raiz}>
        {cabecera}
        <Text style={styles.noExiste}>{isError ? 'No se ha podido cargar el sitio.' : 'Este sitio ya no existe.'}</Text>
      </View>
    );
  }

  const p = personas(pareja);
  const quien = quienGuardo(sitio, pareja.yo.userId, pareja.otra?.userId);
  const autor = quien === 'yo' ? pareja.yo : quien === 'otra' ? pareja.otra : null;
  const categoria = INFO_CATEGORIA_SITIO[sitio.category];
  const estado = estadoPendiente ?? sitio.status;
  const cambiarEstado = async (nuevo: EstadoSitio) => {
    if (nuevo === estado) return;
    // «Hemos ido» sin visitas: se pide la fecha y la visita pone el sitio en «Hemos ido» (lo hace el servidor).
    if (nuevo === 'been' && pedirFechaAlMarcar(estadisticas.data)) return setHojaVisita({ titulo: '¿Cuándo fuisteis?' });
    setEstadoPendiente(nuevo);
    setError(null);
    try {
      await editarSitio(sitio.id, sitio.version, { status: nuevo }, p.nombrePareja);
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
    } finally {
      await invalidar();
      setEstadoPendiente(null);
    }
  };
  const verEnGoogle = () => {
    setError(null);
    Linking.openURL(urlGoogleMaps(sitio)).catch(() => setError('No se ha podido abrir Google Maps.'));
  };
  const notas = sitio.place_notes
    .filter((n) => n.note?.trim())
    .map((n) => {
      const mia = n.user_id === pareja.yo.userId;
      const color = mia ? pareja.yo.color : pareja.otra?.color;
      return { nombre: mia ? 'Tu nota' : `Nota de ${p.nombrePareja}`, texto: (n.note as string).trim(), paleta: color ? personColors[color] : null };
    });
  const hoy = hoyISO();
  const listaVisitas = ordenarVisitas(visitas.data ?? []);
  const textoUltima = textoUltimaVisita(estado, { visit_count: listaVisitas.length, last_visit_on: listaVisitas[0]?.visited_on ?? null }, hoy);
  const sugerida = fechaSugerida(estadisticas.data);
  const quienVisita = (v: Visita) => (v.created_by === pareja.yo.userId ? 'Tú' : v.created_by ? p.nombrePareja : null);
  const apuntarSugerida = async (fecha: string) => {
    setError(null);
    try {
      await anadirVisita(Crypto.randomUUID(), pareja.coupleId, sitio.id, fecha, '');
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
    } finally {
      await invalidar();
    }
  };
  const quitar = async () => {
    if (!quitando) return;
    setQuitandoOcupado(true);
    setErrorQuitar(null);
    try {
      await quitarVisita(quitando.id);
      await invalidar();
      setQuitando(null);
    } catch (e) {
      setErrorQuitar(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
    } finally {
      setQuitandoOcupado(false);
    }
  };
  const textoStats = textoEstadisticas(estadisticas.data);
  const tieneMia = !!miNota(sitio.place_notes, pareja.yo.userId);
  const tieneNota = !!miNota(sitio.place_notes, pareja.yo.userId)?.note?.trim();
  const delSitio = coleccionesDeSitio(sitio.id, colecciones.data ?? [], pertenencias.data ?? []);
  const actualColecciones: Seleccion = {
    ids: delSitio.map((c) => c.id),
    principal: delSitio.some((c) => c.id === sitio.primary_collection_id) ? sitio.primary_collection_id : null,
  };

  return (
    <View style={styles.raiz}>
      {cabecera}
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 24 }]}>
        <BorrarGasto gasto={{ id: sitio.id, visible_to_partner: sitio.visible_to_partner }} pareja={pareja} tipo="place" parte="banda" />
        <MiniMapa lat={sitio.lat} lng={sitio.lng} categoria={sitio.category} estado={sitio.status} privado={!sitio.visible_to_partner} onPress={() => router.navigate({ pathname: '/mapa', params: { sitio: sitio.id } })} />

        <Text accessibilityRole="header" style={styles.titulo}>
          {sitio.name}
        </Text>

        <View style={styles.chips}>
          <View style={styles.chip} accessible accessibilityLabel={`Categoría: ${categoria.etiqueta}`}>
            <Ionicons name={categoria.icono} size={14} color={colors.text} />
            <Text style={styles.chipTexto}>{categoria.etiqueta}</Text>
          </View>
          {!sitio.visible_to_partner ? (
            <View style={styles.chip} accessible accessibilityLabel="Privado, solo tú lo ves">
              <Ionicons name="lock-closed" size={14} color={colors.text} />
              <Text style={styles.chipTexto}>Privado · solo tú</Text>
            </View>
          ) : null}
        </View>

        <Segmentado<EstadoSitio>
          etiqueta="Estado del sitio"
          opciones={(['want_to_go', 'been'] as const).map((valor) => ({ valor, etiqueta: ETIQUETA_ESTADO[valor] }))}
          valor={estado}
          onCambiar={cambiarEstado}
        />

        <View style={styles.tarjeta}>
          {sitio.address ? (
            <View style={styles.fila}>
              <Ionicons name="location-outline" size={20} color={colors.icon} />
              <Text style={styles.filaTexto}>{sitio.address}</Text>
            </View>
          ) : null}
          {autor && p.otra ? (
            <View style={styles.fila}>
              <AvatarPersona nombre={autor.nombre} color={autor.color} avatarPath={autor.avatarPath} tamano={24} />
              <Text style={styles.filaTexto}>{quien === 'yo' ? 'Lo guardaste tú' : `Lo guardó ${p.nombrePareja}`}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.tarjeta}>
          <Text accessibilityRole="header" style={styles.notaTitulo}>
            Colecciones
          </Text>
          {delSitio.length === 0 ? (
            <Text style={styles.filaTexto}>Sin colección · el pin usa el icono de su categoría</Text>
          ) : (
            <View style={styles.chips}>
              {delSitio.map((c) => {
                const principal = c.id === actualColecciones.principal;
                return (
                  <Pressable
                    key={c.id}
                    style={styles.chip}
                    accessibilityRole="button"
                    accessibilityLabel={`Colección ${c.name}${principal ? ', principal' : ''}`}
                    accessibilityHint="Abre la colección"
                    hitSlop={6}
                    onPress={() => router.push({ pathname: '/mapa/coleccion/[id]', params: { id: c.id } })}
                  >
                    <EmojiIcono emoji={c.icon} size={15} />
                    <Text style={styles.chipTexto}>{c.name}</Text>
                    {principal ? <Ionicons name="star" size={13} color={colors.text} /> : null}
                    {principal ? <Text style={styles.chipTexto}>Principal</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          )}
          {delSitio.length > 0 ? <Text style={styles.stats}>La principal da el icono del pin</Text> : null}
          <BotonSecundario etiqueta="+ Añadir a colección" onPress={() => setColeccionando(true)} />
        </View>

        {textoStats ? (
          <Text accessibilityLabel={`Estadísticas: ${textoStats}`} style={styles.stats}>
            {textoStats}
          </Text>
        ) : null}
        {sugerida ? (
          <View style={styles.tarjeta} accessibilityRole="alert">
            <Text style={styles.notaTitulo}>{`¿Fuisteis el ${fechaVisita(sugerida, hoy)}?`}</Text>
            <Text style={styles.filaTexto}>Hay un plan o un gasto en este sitio ese día y no tiene visita apuntada.</Text>
            <BotonSecundario etiqueta="Añadir visita" onPress={() => apuntarSugerida(sugerida)} />
          </View>
        ) : null}
        <BotonSecundario
          etiqueta="Planear aquí"
          onPress={() => router.push({ pathname: '/calendario/nuevo', params: paramsPlanearAqui(sitio, hoyISO()) })}
        />

        <View style={styles.tarjeta}>
          <Text accessibilityRole="header" style={styles.notaTitulo}>
            Historial de visitas
          </Text>
          <Text style={styles.stats}>{[listaVisitas.length > 0 ? textoContadorVisitas(listaVisitas.length) : null, textoUltima].filter(Boolean).join(' · ') || 'Aún no hay visitas apuntadas'}</Text>
          {listaVisitas.map((v) => {
            const gasto = gastoDelDia(planes.data, v.visited_on);
            const detalle = [quienVisita(v), v.note].filter(Boolean).join(' · ');
            return (
              <Pressable
                key={v.id}
                accessibilityRole="button"
                accessibilityLabel={`Visita del ${fechaVisita(v.visited_on, hoy)}${detalle ? `, ${detalle}` : ''}${gasto !== null ? `, ${formatearImporte(gasto)}` : ''}`}
                accessibilityHint="Abre para corregirla o quitarla"
                onPress={() => setHojaVisita({ titulo: 'Visita', visita: v })}
                style={styles.fila}
              >
                <View style={styles.filaTextos}>
                  <Text style={styles.visitaFecha}>{fechaVisita(v.visited_on, hoy)}</Text>
                  {detalle ? (
                    <Text style={styles.notaTitulo} numberOfLines={2}>
                      {detalle}
                    </Text>
                  ) : null}
                </View>
                {gasto !== null ? <Text style={styles.visitaFecha}>{formatearImporte(gasto)}</Text> : null}
                <Ionicons name="chevron-forward" size={18} color={colors.icon} />
              </Pressable>
            );
          })}
          <BotonSecundario etiqueta="+ Añadir visita" onPress={() => setHojaVisita({ titulo: 'Añadir visita' })} />
        </View>

        {planes.data && planes.data.length > 0 ? (
          <View style={styles.tarjeta}>
            <Text accessibilityRole="header" style={styles.notaTitulo}>
              Planes y gastos en este sitio
            </Text>
            {planes.data.map((x) => (
              <Pressable
                key={`${x.tipo}:${x.id}`}
                accessibilityRole="link"
                accessibilityLabel={`${x.tipo === 'evento' ? 'Plan' : 'Gasto'}: ${x.titulo}, ${diaCorto(x.fecha)}${x.importe_cents !== null ? `, ${formatearImporte(x.importe_cents)}` : ''}`}
                onPress={() =>
                  x.tipo === 'evento'
                    ? router.push({ pathname: '/calendario/evento/[id]', params: { id: x.id } })
                    : router.push({ pathname: '/gastos/[id]', params: { id: x.id } })
                }
                style={styles.fila}
              >
                <Ionicons name={x.tipo === 'evento' ? 'calendar-outline' : 'receipt-outline'} size={20} color={colors.icon} />
                <Text style={styles.filaTexto} numberOfLines={2}>
                  {x.titulo}
                </Text>
                <Text style={styles.stats}>{x.importe_cents !== null ? `${diaCorto(x.fecha)} · ${formatearImporte(x.importe_cents)}` : diaCorto(x.fecha)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <ValoracionesPareja sitio={sitio} pareja={pareja} userId={pareja.yo.userId} />
        {puedeValorar(estado) ? (
          <BotonSecundario etiqueta={tieneMia ? 'Editar mi valoración y nota' : 'Valorar y añadir nota'} onPress={() => setValorando(true)} />
        ) : (
          <>
            <BotonSecundario etiqueta={tieneNota ? 'Editar mi nota' : 'Añadir nota'} onPress={() => setValorando(true)} />
            <Text style={styles.stats}>{AVISO_VALORAR}</Text>
          </>
        )}

        {notas.map((n) => (
          <View key={n.nombre} style={[styles.tarjeta, n.paleta && { backgroundColor: n.paleta.bg, borderColor: n.paleta.ink }]} accessible accessibilityLabel={`${n.nombre}: ${n.texto}`}>
            <Text style={[styles.notaTitulo, n.paleta && { color: n.paleta.ink }]}>{n.nombre}</Text>
            <Text style={styles.filaTexto}>{n.texto}</Text>
          </View>
        ))}

        <MensajeError texto={error} />
        <BotonPrincipal etiqueta="Cómo llegar" onPress={() => setLlegar(true)} />
        <BotonSecundario etiqueta="Ver en Google Maps" onPress={verEnGoogle} />
        <BorrarGasto gasto={{ id: sitio.id, visible_to_partner: sitio.visible_to_partner }} pareja={pareja} tipo="place" parte="pie" />
      </ScrollView>
      <HojaComoLlegar sitio={sitio} visible={llegar} onCerrar={() => setLlegar(false)} />
      {valorando && pareja.coupleId && pareja.yo.userId ? (
        <HojaValoracion sitio={sitio} estado={estado} coupleId={pareja.coupleId} userId={pareja.yo.userId} nombrePareja={pareja.otra ? p.nombrePareja : null} onCerrar={() => setValorando(false)} />
      ) : null}
      {coleccionando ? (
        <HojaColecciones sitio={sitio} coupleId={pareja.coupleId} colecciones={colecciones.data ?? []} actual={actualColecciones} onCerrar={() => setColeccionando(false)} />
      ) : null}
      {hojaVisita && pareja.coupleId ? (
        <HojaVisita
          titulo={hojaVisita.titulo}
          sitioId={sitio.id}
          coupleId={pareja.coupleId}
          nombrePareja={p.nombrePareja}
          visita={hojaVisita.visita}
          fechaInicial={hojaVisita.fecha}
          onQuitar={() => {
            setQuitando(hojaVisita.visita ?? null);
            setErrorQuitar(null);
            setHojaVisita(null);
          }}
          onCerrar={() => setHojaVisita(null)}
        />
      ) : null}
      {quitando ? (
        <HojaConfirmar
          titulo="¿Quitar esta visita?"
          texto={`Se quita la visita del ${fechaVisita(quitando.visited_on, hoy)} del historial. Los gastos y eventos de ese día no se tocan.`}
          etiqueta="Quitar visita"
          ocupado={quitandoOcupado}
          error={errorQuitar}
          onConfirmar={quitar}
          onCerrar={() => setQuitando(null)}
        />
      ) : null}
      {editando ? <HojaEditarSitio sitio={sitio} pareja={pareja} onCerrar={() => setEditando(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colors.background },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  redondo: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tituloCabecera: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  contenido: { paddingHorizontal: 20, paddingTop: 8, gap: 14 },
  noExiste: { fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginTop: 40, paddingHorizontal: 32 },
  titulo: { fontFamily: fonts.title, fontSize: 28, lineHeight: 34, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 12, borderRadius: radius.full, backgroundColor: colors.surface },
  chipTexto: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  tarjeta: { gap: 10, padding: 14, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  filaTexto: { flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text },
  stats: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textSecondary },
  filaTextos: { flex: 1, gap: 1 },
  visitaFecha: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  notaTitulo: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textSecondary },
});
