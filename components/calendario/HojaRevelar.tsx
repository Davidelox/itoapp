import { StyleSheet, Text, View } from 'react-native';

import { Hoja } from '@/components/gastos/Hoja';
import { BotonPrincipal, BotonSecundario } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts } from '@/constants/theme';

/** «Revelar a Meri» (docs/plan-calendario.md §2): confirmación en una hoja inferior. Revelar no se puede deshacer. */
export function HojaRevelar({
  visible,
  nombrePareja,
  ocupado,
  error,
  onCerrar,
  onRevelar,
}: {
  visible: boolean;
  nombrePareja: string;
  ocupado: boolean;
  error: string | null;
  onCerrar: () => void;
  onRevelar: () => void;
}) {
  return (
    <Hoja visible={visible} titulo={`¿Revelar a ${nombrePareja}?`} onCerrar={onCerrar} bloqueada={ocupado}>
      <Text style={styles.texto}>{nombrePareja} lo verá. No se puede volver a ocultar.</Text>
      <MensajeError texto={error} />
      <View style={styles.botones}>
        <View style={styles.boton}>
          <BotonSecundario etiqueta="Cancelar" deshabilitado={ocupado} onPress={onCerrar} />
        </View>
        <View style={styles.boton}>
          <BotonPrincipal etiqueta="Revelar" cargando={ocupado} onPress={onRevelar} />
        </View>
      </View>
    </Hoja>
  );
}

const styles = StyleSheet.create({
  texto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.icon },
  botones: { flexDirection: 'row', gap: 8 },
  boton: { flex: 1 },
});
