import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { HojaConfirmar } from '@/components/gastos/HojaConfirmar';
import { FilaTarea } from '@/components/planificador/FilaTarea';
import { HojaTarea } from '@/components/planificador/HojaTarea';
import { HojaTareasSugeridas } from '@/components/planificador/TareasSugeridas';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { ErrorGasto } from '@/lib/gastos/error';
import { personas } from '@/lib/gastos/personas';
import { nombreDeSitio } from '@/lib/mapa/conexiones';
import { ERROR_GENERICO } from '@/lib/mapa/error';
import { useSitios } from '@/lib/mapa/useSitios';
import type { Pareja } from '@/lib/pareja/EstadoProvider';
import { borrarTarea, marcarTarea } from '@/lib/planificador/consultas';
import { PLANTILLAS } from '@/lib/planificador/plantillas';
import { contadorTareas, ordenarTareas, siguientePosicion } from '@/lib/planificador/tareas';
import type { Plan, Tarea } from '@/lib/planificador/tipos';
import { lineaReservaEnlazada } from '@/lib/planificador/reservas';
import { useInvalidarPlanificador, useItinerario } from '@/lib/planificador/usePlanificador';

type Hoja = { tipo: 'nueva' } | { tipo: 'editar'; tarea: Tarea } | { tipo: 'borrar'; tarea: Tarea } | { tipo: 'sugeridas' };

/** Sección «Tareas» del detalle de un plan: lista ordenada, casillas, contador y «+ Añadir tarea». */
export function ListaTareas({ plan, tareas, pareja, userId }: { plan: Plan; tareas: Tarea[]; pareja: Pareja; userId: string }) {
  const colors = useColores();
  const styles = useStyles();
  const invalidar = useInvalidarPlanificador();
  const p = personas(pareja, colors);
  const { data: sitios } = useSitios();
  const itinerario = useItinerario();
  const [hoja, setHoja] = useState<Hoja | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);
  const yo = { slot: p.yo.slot, userId };
  const contador = contadorTareas(tareas);
  const hayPlantilla = tareas.length === 0 && PLANTILLAS[plan.type].length > 0;
  const cerrar = () => {
    setHoja(null);
    setErrorBorrar(null);
  };

  const marcar = async (t: Tarea) => {
    setMarcando(t.id);
    setError(null);
    try {
      await marcarTarea(t.id, t.status === 'pending');
      await invalidar();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
    } finally {
      setMarcando(null);
    }
  };

  const borrar = async (t: Tarea) => {
    setBorrando(true);
    setErrorBorrar(null);
    try {
      await borrarTarea(t.id);
      await invalidar();
      cerrar();
    } catch (e) {
      setErrorBorrar(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
    } finally {
      setBorrando(false);
    }
  };

  return (
    <View style={styles.seccion}>
      <View style={styles.cabecera}>
        <Text accessibilityRole="header" style={styles.titulo}>
          Tareas
        </Text>
        {contador ? (
          <Text role="status" style={styles.contador}>
            {contador}
          </Text>
        ) : null}
      </View>

      {tareas.length === 0 ? <Text style={styles.vacio}>Aún no hay tareas ni reservas. Apuntad lo que queda por hacer.</Text> : null}
      {ordenarTareas(tareas).map((t) => (
        <FilaTarea
          key={t.id}
          tarea={t}
          yo={yo}
          nombrePareja={p.nombrePareja}
          tintaYo={p.tintaYo}
          tintaPareja={p.tintaPareja}
          sitio={t.place_id ? nombreDeSitio(sitios, t.place_id) : null}
          elemento={lineaReservaEnlazada(t, itinerario.data ?? [])}
          ocupada={marcando === t.id}
          onMarcar={() => marcar(t)}
          onAbrir={() => setHoja({ tipo: 'editar', tarea: t })}
        />
      ))}
      <MensajeError texto={error} />

      {hayPlantilla ? (
        <Pressable accessibilityRole="button" onPress={() => setHoja({ tipo: 'sugeridas' })} style={styles.sugeridas}>
          <Text style={styles.sugeridasTexto}>Usar tareas sugeridas</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Añadir tarea" onPress={() => setHoja({ tipo: 'nueva' })} style={styles.anadir}>
        <Text style={styles.anadirTexto}>+ Añadir tarea</Text>
      </Pressable>

      {hoja?.tipo === 'nueva' || hoja?.tipo === 'editar' ? (
        <HojaTarea
          key={hoja.tipo === 'editar' ? hoja.tarea.id : 'nueva'}
          coupleId={pareja.coupleId}
          planId={plan.id}
          yo={p.yo.slot}
          nombrePareja={p.nombrePareja}
          hayPareja={!!p.otra}
          posicion={siguientePosicion(tareas)}
          tarea={hoja.tipo === 'editar' ? hoja.tarea : undefined}
          onBorrar={hoja.tipo === 'editar' ? () => setHoja({ tipo: 'borrar', tarea: hoja.tarea }) : undefined}
          onCerrar={cerrar}
        />
      ) : null}
      {hoja?.tipo === 'sugeridas' ? <HojaTareasSugeridas coupleId={pareja.coupleId} planId={plan.id} tipo={plan.type} desde={siguientePosicion(tareas)} onCerrar={cerrar} /> : null}
      {hoja?.tipo === 'borrar' ? (
        <HojaConfirmar
          titulo="¿Borrar esta tarea?"
          texto={`Se borrará «${hoja.tarea.title}» para los dos. No hace falta que ${p.nombrePareja} lo apruebe, pero no se puede deshacer.`}
          etiqueta="Borrar tarea"
          ocupado={borrando}
          error={errorBorrar}
          onConfirmar={() => borrar(hoja.tarea)}
          onCerrar={cerrar}
        />
      ) : null}
    </View>
  );
}

const useStyles = crearEstilos((colors) => ({
  seccion: { gap: 4, padding: 16, borderRadius: radius.xl - 4, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  cabecera: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 6 },
  titulo: { fontFamily: fonts.title, fontSize: 18, color: colors.text },
  contador: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  vacio: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary, paddingBottom: 6 },
  sugeridas: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sugeridasTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.accent },
  anadir: { minHeight: 44, marginTop: 6, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg - 2, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.inputBorder },
  anadirTexto: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.icon },
}));
