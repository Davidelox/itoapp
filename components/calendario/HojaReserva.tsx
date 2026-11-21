import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Hoja } from '@/components/gastos/Hoja';
import { BotonPrincipal } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, radius } from '@/constants/theme';
import { editarEvento } from '@/lib/calendario/consultas';
import { type Evento, MAX_NOTA_RESERVA, reservaAGuardar } from '@/lib/calendario/evento';
import { ErrorGasto } from '@/lib/gastos/consultas';
import { useInvalidarGastos } from '@/lib/gastos/useGastos';

/** «Marcar como reservado» desde el detalle del evento: hoja rápida con la nota opcional («a nombre de David, 21:30»). */
export function HojaReserva({ evento, nombrePareja, onCerrar }: { evento: Pick<Evento, 'id' | 'version'>; nombrePareja: string; onCerrar: () => void }) {
  const invalidar = useInvalidarGastos();
  const [nota, setNota] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setOcupado(true);
    setError(null);
    try {
      await editarEvento(evento.id, evento.version, reservaAGuardar(true, nota), nombrePareja);
      await invalidar();
      onCerrar();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido guardar. Inténtalo de nuevo.');
      if (e instanceof ErrorGasto && e.codigo === 'version') await invalidar();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Hoja visible titulo="Marcar como reservado" onCerrar={onCerrar} bloqueada={ocupado}>
      <TextInput
        accessibilityLabel="Nota de la reserva (opcional)"
        value={nota}
        onChangeText={setNota}
        maxLength={MAX_NOTA_RESERVA}
        placeholder="A nombre de David, 21:30"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="sentences"
        returnKeyType="done"
        style={styles.campo}
      />
      <MensajeError texto={error} />
      <BotonPrincipal etiqueta="Guardar" cargando={ocupado} onPress={guardar} />
    </Hoja>
  );
}

const styles = StyleSheet.create({
  campo: { height: 50, paddingHorizontal: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.white, fontFamily: fonts.body, fontSize: 16, color: colors.text },
});
