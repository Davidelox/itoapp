import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Hoja } from '@/components/gastos/Hoja';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, radius } from '@/constants/theme';
import { editarEvento } from '@/lib/calendario/consultas';
import { INFO_CATEGORIA_EVENTO } from '@/lib/calendario/evento';
import { tituloDia } from '@/lib/calendario/rejilla';
import { ErrorGasto } from '@/lib/gastos/error';
import { nombreDeSitio } from '@/lib/mapa/conexiones';
import { ERROR_GENERICO } from '@/lib/mapa/error';
import { useSitios } from '@/lib/mapa/useSitios';
import type { Pareja } from '@/lib/pareja/EstadoProvider';
import { personas } from '@/lib/gastos/personas';
import { chipReserva } from '@/lib/planificador/reservas';
import { type ElementoItinerario, agruparItinerario, etiquetaElemento, fechasAlMover, horaElemento, textoDia } from '@/lib/planificador/itinerario';
import type { Plan } from '@/lib/planificador/tipos';
import { useInvalidarPlanificador, useItinerario, useTareas } from '@/lib/planificador/usePlanificador';

/**
 * Sección «Itinerario» del detalle de un plan (F6): todos los días del plan (también los vacíos) con sus elementos
 * ordenados, «+ Añadir» por día y, aparte, lo que ha quedado fuera de las fechas del plan con «Mover a un día del plan».
 */
export function Itinerario({ plan, pareja }: { plan: Plan; pareja: Pareja }) {
  const router = useRouter();
  const invalidar = useInvalidarPlanificador();
  const { data: sitios } = useSitios();
  const consulta = useItinerario();
  const tareas = useTareas();
  const nombrePareja = personas(pareja).nombrePareja;
  const [moviendo, setMoviendo] = useState<ElementoItinerario | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elementos = (consulta.data ?? []).filter((e) => e.plan_id === plan.id);
  const tareasDelPlan = (tareas.data ?? []).filter((t) => t.plan_id === plan.id);
  const { dias, fuera } = agruparItinerario(elementos, plan.start_date, plan.end_date);

  const abrir = (e: ElementoItinerario) => router.push({ pathname: '/calendario/evento/[id]', params: { id: e.id } });
  const anadir = (fecha: string) => router.push({ pathname: '/calendario/nuevo', params: { plan: plan.id, fecha } });
  const abrirSitio = (id: string) => router.push({ pathname: '/mapa/sitio/[id]', params: { id } });

  const mover = async (e: ElementoItinerario, dia: string) => {
    setOcupado(true);
    setError(null);
    try {
      await editarEvento(e.id, e.version, fechasAlMover(e, dia, plan.end_date), nombrePareja);
      await invalidar();
      setMoviendo(null);
    } catch (err) {
      setError(err instanceof ErrorGasto ? err.message : ERROR_GENERICO);
      if (err instanceof ErrorGasto && err.codigo === 'version') await invalidar();
    } finally {
      setOcupado(false);
    }
  };

  const fila = (e: ElementoItinerario, conMover: boolean) => {
    const sitio = nombreDeSitio(sitios, e.place_id);
    const icono = INFO_CATEGORIA_EVENTO[e.category].icono ?? 'calendar-outline';
    const reserva = chipReserva(e, tareasDelPlan);
    return (
      <View key={e.id} style={styles.fila}>
        <Pressable accessibilityRole="button" accessibilityLabel={etiquetaElemento(e, reserva === 'Falta reservar')} accessibilityHint="Abre el evento" onPress={() => abrir(e)} style={styles.principal}>
          <Text style={styles.hora}>{horaElemento(e)}</Text>
          <Ionicons name={icono} size={18} color={colors.icon} />
          <Text style={styles.titulo}>{e.title}</Text>
          {reserva ? (
            <View style={[styles.chip, reserva === 'Falta reservar' && styles.chipFalta]}>
              <Text style={[styles.chipTexto, reserva === 'Falta reservar' && styles.chipFaltaTexto]}>{reserva}</Text>
            </View>
          ) : null}
        </Pressable>
        {sitio && e.place_id ? (
          <Pressable accessibilityRole="link" accessibilityLabel={`Sitio: ${sitio}`} accessibilityHint="Abre la ficha del sitio" onPress={() => abrirSitio(e.place_id as string)} style={styles.sitio}>
            <Text style={styles.sitioTexto}>{sitio}</Text>
          </Pressable>
        ) : null}
        {conMover ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Mover a un día del plan: ${e.title}`} onPress={() => { setError(null); setMoviendo(e); }} style={styles.sitio}>
            <Text style={styles.sitioTexto}>Mover a un día del plan</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.seccion}>
      <Text accessibilityRole="header" style={styles.seccionTitulo}>
        Itinerario
      </Text>
      {consulta.isError && !consulta.data ? <Text style={styles.vacio}>No se ha podido cargar el itinerario.</Text> : null}

      {dias.map((d) => (
        <View key={d.fecha} style={styles.dia}>
          <Text accessibilityRole="header" style={styles.diaTitulo}>
            {textoDia(d, dias.length)}
          </Text>
          {d.elementos.length === 0 ? <Text style={styles.vacio}>Nada planeado este día.</Text> : d.elementos.map((e) => fila(e, false))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Añadir al itinerario, ${tituloDia(d.fecha)}`}
            onPress={() => anadir(d.fecha)}
            style={styles.anadir}
          >
            <Ionicons name="add" size={18} color={colors.accent} />
            <Text style={styles.anadirTexto}>Añadir al itinerario</Text>
          </Pressable>
        </View>
      ))}

      {fuera.length > 0 ? (
        <View style={styles.dia}>
          <Text accessibilityRole="header" style={styles.diaTitulo}>
            Fuera de las fechas del plan
          </Text>
          {fuera.map((e) => fila(e, true))}
        </View>
      ) : null}

      <Hoja visible={moviendo !== null} titulo="Mover a un día del plan" onCerrar={() => setMoviendo(null)} bloqueada={ocupado} desplazable>
        {moviendo ? <Text style={styles.vacio}>{moviendo.title}</Text> : null}
        {dias.map((d) => (
          <Pressable
            key={d.fecha}
            accessibilityRole="button"
            accessibilityLabel={`Mover a ${textoDia(d, dias.length)}`}
            disabled={ocupado}
            onPress={() => moviendo && mover(moviendo, d.fecha)}
            style={styles.opcion}
          >
            <Text style={styles.titulo}>{textoDia(d, dias.length)}</Text>
          </Pressable>
        ))}
        <MensajeError texto={error} />
      </Hoja>
    </View>
  );
}

const styles = StyleSheet.create({
  seccion: { gap: 14, padding: 16, borderRadius: radius.xl - 4, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  seccionTitulo: { fontFamily: fonts.title, fontSize: 18, color: colors.text },
  dia: { gap: 4 },
  diaTitulo: { fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 0.5, color: colors.textSecondary, textTransform: 'uppercase' },
  vacio: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, paddingVertical: 6 },
  fila: { borderTopWidth: 1, borderTopColor: colors.divider },
  principal: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  hora: { width: 72, fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textSecondary },
  titulo: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.text },
  chip: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 8, backgroundColor: colors.accentSoft },
  chipTexto: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.accent },
  chipFalta: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.inputBorder },
  chipFaltaTexto: { color: colors.text },
  sitio: { minHeight: 44, justifyContent: 'center', paddingLeft: 72 + 10 + 18 + 10 },
  sitioTexto: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.accent, textDecorationLine: 'underline' },
  anadir: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  anadirTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.accent },
  opcion: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
});
