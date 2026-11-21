import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, radius } from '@/constants/theme';
import { crearGastoDeEvento } from '@/lib/calendario/consultas';
import { type EventoParaGasto, datosGasto, importeATexto, valoresIniciales } from '@/lib/calendario/quienPago';
import { leerEuros } from '@/lib/dinero/importe';
import { ErrorGasto } from '@/lib/gastos/consultas';
import { hoyISO } from '@/lib/gastos/fechas';
import { personas } from '@/lib/gastos/personas';
import { type Pagador, fraseResultado, partes } from '@/lib/gastos/reparto';
import { useAjustesGastos, useInvalidarGastos } from '@/lib/gastos/useGastos';
import type { Pareja } from '@/lib/pareja/EstadoProvider';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/**
 * «¿Quién pagó?» en la propia tarjeta (mockup Main): importe y tres botones, Tú / pareja / Bote. Cada botón guarda el
 * gasto con los mismos valores que la hoja (`valoresIniciales`: categoría y reparto de los ajustes) y la misma
 * escritura (`crearGastoDeEvento`, con el id del evento). Para cambiar categoría o reparto, «Más opciones» abre la hoja.
 * Un evento secreto no pasa por aquí (su gasto parte de «Solo tú», sin visible): usa la hoja.
 */
export function QuienPagoEnLinea({
  evento,
  pareja,
  onHecho,
  onMas,
  deshabilitado,
}: {
  evento: EventoParaGasto;
  pareja: Pareja;
  /** Texto del resultado («Guardado · María te debe 12,00 €»). */
  onHecho: (texto: string) => void;
  onMas: () => void;
  deshabilitado: boolean;
}) {
  const ajustes = useAjustesGastos();
  const { userId } = useEstado();
  const invalidar = useInvalidarGastos();
  const p = personas(pareja);
  const [importe, setImporte] = useState(evento.budget_cents === null ? '' : importeATexto(evento.budget_cents));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);
  const cents = leerEuros(importe);

  const guardar = async (pagador: Pagador) => {
    setIntentado(true);
    if (cents === null || !userId || !ajustes.data) return;
    setOcupado(true);
    setError(null);
    try {
      const base = valoresIniciales(evento, ajustes.data, hoyISO());
      // Pagar con el bote es del bote; si pagas tú o tu pareja y los ajustes proponían el bote, se reparte a medias.
      const reparto = pagador === 'bote' ? 'bote' : base.reparto === 'bote' ? 'medias' : base.reparto;
      const datos = datosGasto({
        eventoId: evento.id,
        cents,
        concepto: base.concepto,
        categoria: base.categoria,
        fecha: base.fecha,
        yo: p.yo.slot,
        pagador,
        reparto,
        pctYo: 50,
        pctProporcionalM1: ajustes.data.pctProporcionalM1,
        visible: base.visible,
      });
      await crearGastoDeEvento(evento.id, pareja.coupleId, userId, datos, p.nombrePareja);
      const frase = fraseResultado(p.yo.slot, datos.paid_by, partes(cents, datos.split_mode, datos.split_pct_m1), p.nombrePareja, 'presente');
      onHecho(`Guardado · ${frase.texto}`);
      invalidar();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido guardar. Inténtalo de nuevo.');
      if (e instanceof ErrorGasto && (e.codigo === '23505' || e.codigo === 'TW060')) invalidar();
    } finally {
      setOcupado(false);
    }
  };

  const inactivo = deshabilitado || ocupado || !ajustes.data;
  const opciones: { pagador: Pagador; etiqueta: string }[] = [
    { pagador: 'yo', etiqueta: 'Tú' },
    { pagador: 'pareja', etiqueta: p.nombrePareja },
    ...(ajustes.data?.boteActivo ? [{ pagador: 'bote' as const, etiqueta: 'Bote' }] : []),
  ];
  return (
    <View style={styles.caja}>
      <View style={styles.importeFila}>
        <Text style={styles.importeEtiqueta}>Importe</Text>
        <TextInput
          accessibilityLabel="Importe en euros"
          value={importe}
          onChangeText={(t) => setImporte(t.replace(/[^0-9.,]/g, ''))}
          placeholder="0,00 €"
          placeholderTextColor={colors.textSecondary}
          keyboardType="decimal-pad"
          inputMode="decimal"
          returnKeyType="done"
          style={styles.campo}
        />
      </View>
      <MensajeError texto={intentado && cents === null ? 'Escribe un importe, por ejemplo 60 o 12,50.' : null} />
      <View accessibilityRole="radiogroup" accessibilityLabel="¿Quién pagó?" style={styles.botones}>
        {opciones.map((o) => (
          <Pressable
            key={o.pagador}
            accessibilityRole="button"
            accessibilityLabel={`Pagó ${o.etiqueta}`}
            disabled={inactivo}
            onPress={() => guardar(o.pagador)}
            style={({ pressed }) => [styles.boton, pressed && { backgroundColor: colors.segmented }, inactivo && { opacity: 0.5 }]}
          >
            <Text style={styles.botonTexto} numberOfLines={1}>
              {o.etiqueta}
            </Text>
          </Pressable>
        ))}
      </View>
      <MensajeError texto={error} />
      <Pressable accessibilityRole="button" disabled={inactivo} onPress={onMas} style={styles.mas}>
        <Text style={styles.masTexto}>Más opciones</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { gap: 10 },
  importeFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  importeEtiqueta: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textSecondary },
  campo: {
    width: 130,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
  },
  botones: { flexDirection: 'row', gap: 8 },
  boton: { flex: 1, minHeight: 44, borderRadius: radius.full, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  botonTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  mas: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  masTexto: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.accent },
});
