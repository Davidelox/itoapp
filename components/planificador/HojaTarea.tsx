import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { Text, TextInput } from 'react-native';

import { Chip, FilaChips, Grupo } from '@/components/gastos/Controles';
import { Hoja } from '@/components/gastos/Hoja';
import { SelectorFecha } from '@/components/gastos/SelectorFecha';
import { CampoSitio } from '@/components/mapa/CampoSitio';
import { BotonPrincipal, EnlaceTexto } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { ErrorGasto } from '@/lib/gastos/error';
import { hoyISO } from '@/lib/gastos/fechas';
import { ERROR_GENERICO } from '@/lib/mapa/error';
import { crearTareas, editarTarea } from '@/lib/planificador/consultas';
import { cuandoElemento, elementosEnlazables, elementosPorDia, recargaTrasError } from '@/lib/planificador/reservas';
import {
  MAX_NOTA_TAREA,
  MAX_TITULO_TAREA,
  TIPOS_TAREA,
  errorNotaTarea,
  errorTitulo,
  filaDeTarea,
  formularioDeTarea,
  formularioTareaNuevo,
} from '@/lib/planificador/tareas';
import type { Tarea } from '@/lib/planificador/tipos';
import { useInvalidarPlanificador, useItinerario, useTareas } from '@/lib/planificador/usePlanificador';

/**
 * Crear o editar una tarea o reserva en hoja inferior: título, tipo, a quién se asigna, fecha límite opcional, nota y, en una
 * reserva, el sitio. Se monta al abrirla, así parte siempre de lo guardado. Con `tarea` edita (y ofrece «Borrar tarea»).
 */
export function HojaTarea({
  coupleId,
  planId,
  yo,
  nombrePareja,
  hayPareja,
  posicion,
  tarea,
  onBorrar,
  onCerrar,
}: {
  coupleId: string;
  planId: string;
  yo: 'm1' | 'm2';
  nombrePareja: string;
  hayPareja: boolean;
  /** Posición de una tarea nueva (al final). */
  posicion: number;
  tarea?: Tarea;
  onBorrar?: () => void;
  onCerrar: () => void;
}) {
  const colors = useColores();
  const styles = useStyles();
  const invalidar = useInvalidarPlanificador();
  const itinerario = useItinerario();
  const todas = useTareas();
  const [f, setF] = useState(() => (tarea ? formularioDeTarea(tarea, yo) : formularioTareaNuevo()));
  const [intentado, setIntentado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Id fijado al abrir: reintentar tras un fallo de red no duplica la tarea.
  const [id] = useState(() => tarea?.id ?? Crypto.randomUUID());
  const errTitulo = errorTitulo(f.titulo);
  const errNota = errorNotaTarea(f.nota);
  // Solo se ofrecen los elementos de este plan que no tienen ya otra reserva (la propia sí).
  const enlazables = elementosEnlazables(itinerario.data ?? [], todas.data ?? [], planId, tarea?.id);

  const guardar = async () => {
    setIntentado(true);
    if (errTitulo || errNota) return;
    setOcupado(true);
    setError(null);
    try {
      const fila = filaDeTarea(f, yo);
      if (tarea) await editarTarea(tarea.id, tarea.version, fila, nombrePareja);
      else await crearTareas(coupleId, planId, [{ id, position: posicion, ...fila }]);
      await invalidar();
      onCerrar();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
      // Con el elemento ya reservado por otra, o dos personas a la vez, se recarga para ver el estado real.
      if (e instanceof ErrorGasto && recargaTrasError(e.codigo)) await invalidar();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Hoja
      visible
      titulo={tarea ? 'Editar tarea' : 'Nueva tarea'}
      onCerrar={onCerrar}
      bloqueada={ocupado}
      desplazable
      pie={<BotonPrincipal etiqueta={tarea ? 'Guardar cambios' : 'Añadir tarea'} cargando={ocupado} onPress={guardar} />}
    >
      <Grupo etiqueta="Título">
        <TextInput
          accessibilityLabel="Título de la tarea"
          value={f.titulo}
          onChangeText={(titulo) => setF((x) => ({ ...x, titulo }))}
          maxLength={MAX_TITULO_TAREA}
          placeholder="Comprar regalo, reservar cena…"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="sentences"
          returnKeyType="done"
          style={styles.campo}
        />
        <MensajeError texto={intentado ? errTitulo : null} />
      </Grupo>
      <Grupo etiqueta="Tipo" rol="radiogroup">
        <FilaChips>
          {TIPOS_TAREA.map((t) => (
            <Chip key={t.valor} rol="radio" etiqueta={t.etiqueta} activo={f.tipo === t.valor} onPress={() => setF((x) => ({ ...x, tipo: t.valor }))} />
          ))}
        </FilaChips>
      </Grupo>
      <Grupo etiqueta="Asignada a" rol="radiogroup">
        <FilaChips>
          <Chip rol="radio" etiqueta="Tú" activo={f.asignada === 'yo'} onPress={() => setF((x) => ({ ...x, asignada: 'yo' }))} />
          {hayPareja || f.asignada === 'pareja' ? <Chip rol="radio" etiqueta={nombrePareja} activo={f.asignada === 'pareja'} onPress={() => setF((x) => ({ ...x, asignada: 'pareja' }))} /> : null}
          <Chip rol="radio" etiqueta="Sin asignar" activo={f.asignada === null} onPress={() => setF((x) => ({ ...x, asignada: null }))} />
        </FilaChips>
      </Grupo>
      <Grupo etiqueta="Fecha límite (opcional)" rol="radiogroup">
        {f.fecha === null ? (
          <FilaChips>
            <Chip rol="radio" etiqueta="Sin fecha" activo onPress={() => undefined} />
            <Chip rol="radio" etiqueta="Poner fecha" activo={false} onPress={() => setF((x) => ({ ...x, fecha: hoyISO() }))} />
          </FilaChips>
        ) : (
          <>
            <SelectorFecha valor={f.fecha} onCambiar={(fecha) => setF((x) => ({ ...x, fecha }))} modo="todas" />
            <EnlaceTexto etiqueta="Quitar la fecha" onPress={() => setF((x) => ({ ...x, fecha: null }))} />
          </>
        )}
      </Grupo>
      {f.tipo === 'booking' ? <CampoSitio valor={f.sitio} onCambiar={(sitio) => setF((x) => ({ ...x, sitio }))} compartido /> : null}
      {f.tipo === 'booking' ? (
        <Grupo etiqueta="Elemento del itinerario" rol="radiogroup">
          <FilaChips>
            <Chip rol="radio" etiqueta="Sin enlazar" activo={f.elemento === null} onPress={() => setF((x) => ({ ...x, elemento: null }))} />
          </FilaChips>
          {elementosPorDia(enlazables).map((d) => (
            <FilaChips key={d.fecha}>
              {d.elementos.map((e) => (
                <Chip
                  key={e.id}
                  rol="radio"
                  etiqueta={`${e.title} · ${cuandoElemento(e)}`}
                  activo={f.elemento === e.id}
                  onPress={() => setF((x) => ({ ...x, elemento: e.id }))}
                />
              ))}
            </FilaChips>
          ))}
          {enlazables.length === 0 ? <Text style={styles.ayuda}>No hay elementos libres en el itinerario de este plan.</Text> : null}
        </Grupo>
      ) : null}
      <Grupo etiqueta="Nota (opcional)">
        <TextInput
          accessibilityLabel="Nota de la tarea"
          value={f.nota}
          onChangeText={(nota) => setF((x) => ({ ...x, nota }))}
          maxLength={MAX_NOTA_TAREA}
          placeholder="A nombre de quién, qué recordar…"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="sentences"
          multiline
          textAlignVertical="top"
          style={[styles.campo, styles.nota]}
        />
        <MensajeError texto={intentado ? errNota : null} />
      </Grupo>
      <MensajeError texto={error} />
      {tarea && onBorrar ? <EnlaceTexto etiqueta="Borrar tarea" deshabilitado={ocupado} onPress={onBorrar} /> : null}
    </Hoja>
  );
}

const useStyles = crearEstilos((colors) => ({
  nota: { height: undefined, minHeight: 84, maxHeight: 220, paddingTop: 14, paddingBottom: 14 },
  ayuda: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  campo: { height: 50, paddingHorizontal: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.card, fontFamily: fonts.body, fontSize: 16, color: colors.text },
}));
