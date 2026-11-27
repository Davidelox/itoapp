import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Hoja } from '@/components/gastos/Hoja';
import { BotonPrincipal, EnlaceTexto } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { fonts } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { leerEuros } from '@/lib/dinero/importe';
import { ponerImporte } from '@/lib/gastos/consultasRecurrentes';
import { ErrorGasto } from '@/lib/gastos/error';
import { personas } from '@/lib/gastos/personas';
import { type Cobro, type Recurrente, fechaCobro, importeRecurrente, textoQuien } from '@/lib/gastos/recurrentes';
import { fraseResultado, partes } from '@/lib/gastos/reparto';
import { useInvalidarGastos } from '@/lib/gastos/useGastos';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

/** Importe real de un cobro variable (la factura de la luz): crea su gasto con el reparto del recurrente. */
export function HojaImporte({
  cobro,
  recurrente,
  pareja,
  onCerrar,
  onHecho,
  onVerPago,
}: {
  cobro: Cobro;
  recurrente: Recurrente;
  pareja: Pareja;
  onCerrar: () => void;
  onHecho: () => void;
  /** Con él sale «Ver el pago» (el calendario abre esta hoja en vez del detalle del recurrente). */
  onVerPago?: () => void;
}) {
  const colors = useColores();
  const styles = useStyles();
  const p = personas(pareja, colors);
  const invalidar = useInvalidarGastos();
  const [texto, setTexto] = useState((recurrente.amount_cents / 100).toFixed(2).replace('.', ','));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Id del gasto fijado al abrir la hoja: reintentar no lo duplica.
  const [idGasto] = useState(() => Crypto.randomUUID());
  const cents = leerEuros(texto);
  const resultado = fraseResultado(
    p.yo.slot,
    recurrente.paid_by,
    partes(cents ?? 0, recurrente.split_mode, recurrente.split_pct_m1),
    p.nombrePareja,
    'futuro',
  );

  const guardar = async () => {
    if (cents === null) return;
    setOcupado(true);
    setError(null);
    try {
      await ponerImporte(idGasto, pareja.coupleId, cobro, recurrente, cents);
      onHecho();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido guardar. Inténtalo de nuevo.');
      // Ya apuntado por la otra persona o el cobro ya no existe: recarga para que la tarjeta desaparezca.
      if (e instanceof ErrorGasto && (e.codigo === '23505' || e.codigo === 'TW082')) invalidar();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Hoja visible titulo={recurrente.name} onCerrar={onCerrar} bloqueada={ocupado}>
      <Text style={styles.ayuda}>
        Cobro del {fechaCobro(cobro.due_date)} · {textoQuien(recurrente, p.yo.slot, p.nombrePareja)} · aproximado{' '}
        {importeRecurrente(recurrente).replace('~', '')}
      </Text>
      <View style={styles.fila}>
        <TextInput
          accessibilityLabel="Importe de la factura en euros"
          value={texto}
          onChangeText={(t) => setTexto(t.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
          inputMode="decimal"
          autoFocus
          selectTextOnFocus
          style={styles.importe}
        />
        <Text style={styles.euro}>€</Text>
      </View>
      <Text style={styles.resultado}>{resultado.texto}</Text>
      <MensajeError texto={error ?? (texto.trim() !== '' && cents === null ? 'Escribe un importe, por ejemplo 52,30.' : null)} />
      <BotonPrincipal etiqueta="Apuntar gasto" etiquetaCargando="Guardando…" cargando={ocupado} deshabilitado={cents === null} onPress={guardar} />
      {onVerPago ? <EnlaceTexto etiqueta="Ver el pago" deshabilitado={ocupado} onPress={onVerPago} /> : null}
    </Hoja>
  );
}

const useStyles = crearEstilos((colors) => ({
  ayuda: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  importe: { minWidth: 120, maxWidth: 240, height: 64, textAlign: 'right', fontFamily: fonts.title, fontSize: 44, color: colors.text },
  euro: { fontFamily: fonts.title, fontSize: 44, color: colors.text },
  resultado: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text, textAlign: 'center' },
}));
