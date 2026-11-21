import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { FormularioEvento } from '@/components/calendario/FormularioEvento';
import { colors, fonts, radius } from '@/constants/theme';
import type { Evento } from '@/lib/calendario/evento';
import { useEvento } from '@/lib/calendario/useCalendario';
import { personas } from '@/lib/gastos/personas';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { usePlanes } from '@/lib/planificador/usePlanificador';

/**
 * Editar un evento (en uno repetido, toda la serie). Como al editar un gasto o un pago recurrente, el
 * formulario arranca con una copia fija: si tu pareja lo cambia mientras tanto (tiempo real), no se pierde
 * lo que estás escribiendo; sale un aviso con «Recargar».
 */
export default function EditarEvento() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pareja } = useEstado();
  const evento = useEvento(id);
  const planes = usePlanes();
  const [copia, setCopia] = useState<Evento | null>(null);
  // Tras guardar tú, la versión sube por tu propio cambio: no es un aviso de tu pareja.
  const [guardandoYo, setGuardandoYo] = useState(false);

  // La primera versión que llega se congela como punto de partida del formulario.
  if (!copia && evento.data) setCopia(evento.data);

  if (!pareja || (evento.isLoading && !copia) || (copia?.plan_id && planes.isLoading)) {
    return (
      <View style={styles.centro}>
        <CargandoHilo size="large" color={colors.accent} />
      </View>
    );
  }
  if (!copia) {
    return (
      <View style={styles.centro}>
        <Text style={styles.texto}>Este evento ya no existe.</Text>
      </View>
    );
  }

  // Elemento del itinerario: su plan limita la fecha y no se puede cambiar (TW069).
  const plan = copia.plan_id ? planes.data?.find((p) => p.id === copia.plan_id) : undefined;
  if (copia.plan_id && !plan) {
    return (
      <View style={styles.centro}>
        <Text style={styles.texto}>Este plan ya no existe.</Text>
      </View>
    );
  }
  const masNuevo = !guardandoYo && evento.data && evento.data.version > copia.version ? evento.data : null;
  const nombre = personas(pareja).nombrePareja;

  return (
    <View style={styles.raiz}>
      <FormularioEvento key={`${copia.id}:${copia.version}`} pareja={pareja} inicial={copia} plan={plan} alGuardarEdicion={setGuardandoYo} />
      {masNuevo ? (
        <View style={styles.aviso} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.avisoTexto}>{nombre} ha cambiado este evento mientras lo editabas.</Text>
          <Pressable accessibilityRole="button" onPress={() => setCopia(masNuevo)} style={styles.avisoBoton}>
            <Text style={styles.avisoEnlace}>Recargar</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  texto: { fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary },
  aviso: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 110,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: radius.lg,
    backgroundColor: colors.text,
  },
  avisoTexto: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 19, color: colors.white },
  avisoBoton: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, justifyContent: 'center' },
  avisoEnlace: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.accentSoft },
});
