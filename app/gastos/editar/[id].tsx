import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { FormularioGasto } from '@/components/gastos/FormularioGasto';
import { colors, fonts, radius } from '@/constants/theme';
import type { Gasto } from '@/lib/gastos/consultas';
import { personas } from '@/lib/gastos/personas';
import { useAjustesGastos, useGasto } from '@/lib/gastos/useGastos';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/**
 * Editar un gasto. El formulario arranca con una copia fija del gasto: si la otra persona lo cambia
 * mientras tanto (tiempo real), no se pierde lo que se está escribiendo; sale un aviso con «Recargar».
 */
export default function EditarGasto() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pareja } = useEstado();
  const ajustes = useAjustesGastos();
  const gasto = useGasto(id);
  const [copia, setCopia] = useState<Gasto | null>(null);
  // Tras guardar tú, la versión sube por tu propio cambio: no es un aviso de tu pareja.
  const [guardandoYo, setGuardandoYo] = useState(false);

  // La primera versión que llega se congela como punto de partida del formulario.
  if (!copia && gasto.data) setCopia(gasto.data);

  if (!pareja || ajustes.isLoading || (gasto.isLoading && !copia)) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!ajustes.data || !copia) {
    return (
      <View style={styles.centro}>
        <Text style={styles.texto}>Este gasto ya no existe.</Text>
      </View>
    );
  }

  const masNuevo = !guardandoYo && gasto.data && gasto.data.version > copia.version ? gasto.data : null;
  const nombre = personas(pareja).nombrePareja;

  return (
    <View style={styles.raiz}>
      <FormularioGasto
        key={`${copia.id}:${copia.version}`}
        pareja={pareja}
        ajustes={ajustes.data}
        inicial={copia}
        alGuardarEdicion={setGuardandoYo}
      />
      {masNuevo ? (
        <View style={styles.aviso} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.avisoTexto}>{nombre} ha cambiado este gasto mientras lo editabas.</Text>
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
