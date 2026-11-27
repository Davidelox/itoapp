import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { FormularioColeccion } from '@/components/mapa/FormularioColeccion';
import { fonts } from '@/constants/theme';
import { useColores } from '@/lib/tema';
import { useColecciones } from '@/lib/mapa/useSitios';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/** Editar una colección: nombre, icono, visibilidad y borrado. */
export default function EditarColeccion() {
  const colors = useColores();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pareja } = useEstado();
  const colecciones = useColecciones();
  const coleccion = colecciones.data?.find((c) => c.id === id);
  if (!pareja || colecciones.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <CargandoHilo size="large" color={colors.accent} />
      </View>
    );
  }
  if (!coleccion) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary, textAlign: 'center' }}>Esta colección ya no existe.</Text>
      </View>
    );
  }
  return <FormularioColeccion pareja={pareja} coleccion={coleccion} />;
}
