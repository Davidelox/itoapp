import { StyleSheet, Text, View } from 'react-native';

import { Hoja } from '@/components/gastos/Hoja';
import { BotonPrincipal, BotonSecundario } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts } from '@/constants/theme';

/**
 * Confirmación de algo que se pierde (deshacer un pago…): hoja inferior con la consecuencia clara, «Cancelar» y el
 * botón granate de la acción. `BorrarGasto` y los borrados de Ajustes tienen la suya con la misma forma.
 */
export function HojaConfirmar({
  titulo,
  texto,
  etiqueta,
  onConfirmar,
  onCerrar,
  ocupado = false,
  error = null,
}: {
  titulo: string;
  texto: string;
  etiqueta: string;
  onConfirmar: () => void;
  onCerrar: () => void;
  ocupado?: boolean;
  error?: string | null;
}) {
  return (
    <Hoja visible titulo={titulo} onCerrar={onCerrar} bloqueada={ocupado} alerta>
      <Text style={styles.texto}>{texto}</Text>
      <MensajeError texto={error} />
      <View style={styles.botones}>
        <View style={styles.boton}>
          <BotonSecundario etiqueta="Cancelar" deshabilitado={ocupado} onPress={onCerrar} />
        </View>
        <View style={styles.boton}>
          <BotonPrincipal etiqueta={etiqueta} cargando={ocupado} onPress={onConfirmar} />
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
