import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { FormularioEvento, type TipoFormulario } from '@/components/calendario/FormularioEvento';
import { colors } from '@/constants/theme';
import type { CategoriaEvento } from '@/lib/calendario/evento';
import { aISO, deISO, hoyISO } from '@/lib/gastos/fechas';
import { useEstado } from '@/lib/pareja/EstadoProvider';

const TIPOS: TipoFormulario[] = ['evento', 'cumple', 'pago'];
const CATEGORIAS: CategoriaEvento[] = ['trip', 'eating_out', 'leisure'];

/**
 * Nuevo evento. `?fecha=YYYY-MM-DD` precarga el día (el seleccionado en el calendario, también si ya pasó);
 * `?tipo=evento|cumple|pago` y `?categoria=trip|eating_out|leisure` los sugiere el filtro activo del calendario.
 */
export default function NuevoEvento() {
  const { pareja } = useEstado();
  const { fecha, tipo, categoria } = useLocalSearchParams<{ fecha?: string; tipo?: string; categoria?: string }>();
  if (!pareja) {
    return (
      <View style={styles.cargando}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  const valida = !!fecha && aISO(deISO(fecha)) === fecha;
  return (
    <FormularioEvento
      pareja={pareja}
      fechaInicial={valida ? fecha : hoyISO()}
      tipoInicial={TIPOS.find((t) => t === tipo)}
      categoriaInicial={CATEGORIAS.find((c) => c === categoria)}
    />
  );
}

const styles = StyleSheet.create({
  cargando: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
