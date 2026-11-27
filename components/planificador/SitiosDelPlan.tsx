import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { HojaConfirmar } from '@/components/gastos/HojaConfirmar';
import { FilaSitio } from '@/components/mapa/FilaSitio';
import { HojaAnadirSitios } from '@/components/mapa/HojaAnadirSitios';
import { BotonSecundario } from '@/components/onboarding/Botones';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { ErrorGasto } from '@/lib/gastos/error';
import { personas } from '@/lib/gastos/personas';
import { sitiosAnadibles, textoContadorSitios } from '@/lib/mapa/colecciones';
import { quitarSitioDeColeccion } from '@/lib/mapa/consultasColecciones';
import { ERROR_GENERICO } from '@/lib/mapa/error';
import { ETIQUETA_ESTADO } from '@/lib/mapa/lista';
import { useColecciones, usePertenencias, useSitios } from '@/lib/mapa/useSitios';
import type { Pareja } from '@/lib/pareja/EstadoProvider';
import { diasDelPlan } from '@/lib/planificador/itinerario';
import { coleccionDelPlan, sitiosDelPlan, textoAnadidoPor, textoEnItinerario } from '@/lib/planificador/sitios';
import type { Plan } from '@/lib/planificador/tipos';
import { useInvalidarPlanificador, useItinerario } from '@/lib/planificador/usePlanificador';

/**
 * Sección «Sitios» del detalle de un plan (F7): los sitios de su colección automática, con quién los añadió, su estado y
 * si ya están en el itinerario. Añadir uno guardado, guardar uno nuevo, quitarlo (solo de la colección: el sitio se
 * conserva) y verlos en el mapa.
 */
export function SitiosDelPlan({ plan, pareja }: { plan: Plan; pareja: Pareja }) {
  const colors = useColores();
  const styles = useStyles();
  const router = useRouter();
  const invalidar = useInvalidarPlanificador();
  const colecciones = useColecciones();
  const pertenencias = usePertenencias();
  const sitios = useSitios();
  const itinerario = useItinerario();
  const [anadiendo, setAnadiendo] = useState(false);
  const [quitando, setQuitando] = useState<{ id: string; nombre: string; enItinerario: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coleccion = coleccionDelPlan(plan.id, colecciones.data ?? []);
  // Sin colección visible (aún cargando o no existe) no hay nada que enseñar.
  if (!coleccion) return null;

  const p = personas(pareja, colors);
  const lista = sitiosDelPlan(coleccion.id, plan, sitios.data ?? [], pertenencias.data ?? [], itinerario.data ?? []);
  const totalDias = diasDelPlan(plan.start_date, plan.end_date).length;
  const faltan = sitiosAnadibles(coleccion.id, sitios.data ?? [], pertenencias.data ?? []);

  const quitar = async () => {
    if (!quitando) return;
    setOcupado(true);
    setError(null);
    try {
      await quitarSitioDeColeccion(coleccion.id, quitando.id, pareja.coupleId);
      await invalidar();
      setQuitando(null);
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <View style={styles.seccion}>
      <Text accessibilityRole="header" style={styles.seccionTitulo}>
        {`Sitios · ${textoContadorSitios(lista.length)}`}
      </Text>
      {sitios.isError && !sitios.data ? <Text style={styles.vacio}>No se han podido cargar los sitios.</Text> : null}
      {lista.length === 0 && !sitios.isError ? <Text style={styles.vacio}>Aún no hay sitios en este plan. Los del itinerario y las tareas entran solos.</Text> : null}

      {lista.map(({ sitio, anadidoPor, dias }, i) => {
        const enItinerario = textoEnItinerario(dias, totalDias);
        const quien = textoAnadidoPor(anadidoPor, pareja.yo.userId, p.nombrePareja);
        return (
          <View key={sitio.id} style={[styles.bloque, i < lista.length - 1 && styles.separador]}>
            <FilaSitio sitio={sitio} pareja={pareja} separador={false} onPress={() => router.push({ pathname: '/mapa/sitio/[id]', params: { id: sitio.id } })} />
            <View style={styles.extras}>
              <View style={styles.chip} accessible accessibilityLabel={`Estado: ${ETIQUETA_ESTADO[sitio.status]}`}>
                <Text style={styles.chipTexto}>{ETIQUETA_ESTADO[sitio.status]}</Text>
              </View>
              {enItinerario ? (
                <View style={[styles.chip, styles.chipItinerario]} accessible accessibilityLabel={enItinerario}>
                  <Ionicons name="calendar-outline" size={13} color={colors.accent} />
                  <Text style={[styles.chipTexto, { color: colors.accent }]}>{enItinerario}</Text>
                </View>
              ) : null}
              {quien && p.otra ? <Text style={styles.quien}>{quien}</Text> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Quitar ${sitio.name} del plan`}
                hitSlop={4}
                onPress={() => {
                  setError(null);
                  setQuitando({ id: sitio.id, nombre: sitio.name, enItinerario: dias.length > 0 });
                }}
                style={styles.quitar}
              >
                <Text style={styles.quitarTexto}>Quitar</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      {faltan.length > 0 ? <BotonSecundario etiqueta="+ Añadir sitio" onPress={() => setAnadiendo(true)} /> : null}
      <BotonSecundario etiqueta="Guardar un sitio nuevo" onPress={() => router.push({ pathname: '/mapa/nuevo', params: { coleccion: coleccion.id } })} />
      {lista.length > 0 ? <BotonSecundario etiqueta="Ver en el mapa" onPress={() => router.navigate({ pathname: '/mapa', params: { coleccion: coleccion.id } })} /> : null}

      {anadiendo ? <HojaAnadirSitios coleccion={coleccion} coupleId={pareja.coupleId} sitios={faltan} onCerrar={() => setAnadiendo(false)} /> : null}
      {quitando ? (
        <HojaConfirmar
          titulo={`¿Quitar «${quitando.nombre}» del plan?`}
          texto={`Solo se quita de los sitios del plan: el sitio se conserva en vuestro mapa.${quitando.enItinerario ? ' Sus elementos del itinerario siguen donde están.' : ''}`}
          etiqueta="Quitar del plan"
          ocupado={ocupado}
          error={error}
          onConfirmar={quitar}
          onCerrar={() => setQuitando(null)}
        />
      ) : null}
    </View>
  );
}

const useStyles = crearEstilos((colors) => ({
  seccion: { gap: 10, padding: 16, borderRadius: radius.xl - 4, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  seccionTitulo: { fontFamily: fonts.title, fontSize: 18, color: colors.text },
  vacio: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  bloque: { gap: 2 },
  separador: { borderBottomWidth: 1, borderBottomColor: colors.divider, paddingBottom: 6 },
  extras: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingLeft: 40 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 10, backgroundColor: colors.surface },
  chipItinerario: { backgroundColor: colors.accentSoft },
  chipTexto: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
  quien: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
  quitar: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6, marginLeft: 'auto' },
  quitarTexto: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textSecondary, textDecorationLine: 'underline' },
}));
