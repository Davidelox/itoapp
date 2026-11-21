import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Hoja } from '@/components/gastos/Hoja';
import { BotonPrincipal } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts } from '@/constants/theme';
import { ErrorGasto } from '@/lib/gastos/error';
import { ERROR_GENERICO } from '@/lib/mapa/error';
import { crearTareas } from '@/lib/planificador/consultas';
import { MAX_SUGERIDAS, PLANTILLAS, alternarSugerida, elegidas, filasSugeridas } from '@/lib/planificador/plantillas';
import type { TipoPlan } from '@/lib/planificador/tipos';
import { useInvalidarPlanificador } from '@/lib/planificador/usePlanificador';

/** Casillas de las tareas sugeridas de un tipo de plan: todas marcadas salvo las de `desmarcadas` (por título). */
export function CasillasSugeridas({ tipo, desmarcadas, onCambiar }: { tipo: TipoPlan; desmarcadas: readonly string[]; onCambiar: (d: string[]) => void }) {
  return (
    <View>
      {PLANTILLAS[tipo].map((s) => {
        const marcada = !desmarcadas.includes(s.titulo);
        return (
          <Pressable
            key={s.titulo}
            accessibilityRole="checkbox"
            accessibilityLabel={s.tipo === 'booking' ? `${s.titulo}, reserva` : s.titulo}
            accessibilityState={{ checked: marcada }}
            onPress={() => onCambiar(alternarSugerida(desmarcadas, s.titulo))}
            style={styles.fila}
          >
            <View style={[styles.casilla, marcada && styles.casillaMarcada]}>{marcada ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}</View>
            <Text style={styles.titulo}>{s.titulo}</Text>
            {s.tipo === 'booking' ? <Text style={styles.tipo}>Reserva</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** «Usar tareas sugeridas» desde el detalle de un plan sin tareas: añade las marcadas tras las que ya hay (`desde`). */
export function HojaTareasSugeridas({ coupleId, planId, tipo, desde, onCerrar }: { coupleId: string; planId: string; tipo: TipoPlan; desde: number; onCerrar: () => void }) {
  const invalidar = useInvalidarPlanificador();
  const [desmarcadas, setDesmarcadas] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ids fijados al abrir: reintentar tras un fallo de red no duplica las tareas.
  const [ids] = useState(() => Array.from({ length: MAX_SUGERIDAS }, () => Crypto.randomUUID()));
  const marcadas = elegidas(tipo, desmarcadas);

  const anadir = async () => {
    setOcupado(true);
    setError(null);
    try {
      await crearTareas(coupleId, planId, filasSugeridas(marcadas, ids, desde));
      await invalidar();
      onCerrar();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Hoja
      visible
      titulo="Tareas sugeridas"
      onCerrar={onCerrar}
      bloqueada={ocupado}
      pie={<BotonPrincipal etiqueta={marcadas.length === 1 ? 'Añadir 1 tarea' : `Añadir ${marcadas.length} tareas`} deshabilitado={marcadas.length === 0} cargando={ocupado} onPress={anadir} />}
    >
      <CasillasSugeridas tipo={tipo} desmarcadas={desmarcadas} onCambiar={setDesmarcadas} />
      <MensajeError texto={error} />
    </Hoja>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  casilla: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' },
  casillaMarcada: { backgroundColor: colors.accent, borderColor: colors.accent },
  titulo: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.text },
  tipo: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
});
