import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { FilaGasto } from '@/components/gastos/FilaGasto';
import { BotonPrincipal, BotonSecundario, EnlaceTexto } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, radius } from '@/constants/theme';
import { formatearImporte } from '@/lib/dinero/importe';
import { ErrorGasto, deshacerPago, responderPago } from '@/lib/gastos/consultas';
import { aISO, fechaLarga } from '@/lib/gastos/fechas';
import { personas } from '@/lib/gastos/personas';
import { ESTADO_PAGO, NOMBRE_METODO, sePuedeDeshacer, textoPago } from '@/lib/gastos/saldar';
import { useInvalidarGastos, usePago } from '@/lib/gastos/useGastos';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/** Detalle de un pago (no está en los mockups; mismo estilo que el detalle de gasto). */
export default function DetallePago() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pareja, userId } = useEstado();
  const consulta = usePago(id);
  const invalidar = useInvalidarGastos();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const volver = () => (router.canGoBack() ? router.back() : router.replace('/gastos'));
  const cabecera = (
    <View style={[styles.cabecera, { paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={volver} style={styles.redondo}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.titulo}>
        Pago
      </Text>
      <View style={styles.hueco} />
    </View>
  );

  if (!pareja || consulta.isLoading) {
    return (
      <View style={styles.raiz}>
        {cabecera}
        <CargandoHilo size="large" color={colors.accent} style={{ marginTop: 40 }} />
      </View>
    );
  }
  if (!consulta.data) {
    return (
      <View style={styles.raiz}>
        {cabecera}
        <Text style={styles.noExiste}>{consulta.isError ? 'No se ha podido cargar el pago.' : 'Este pago ya no existe (se ha deshecho).'}</Text>
      </View>
    );
  }

  const { pago, gastos } = consulta.data;
  const p = personas(pareja);
  const yo = p.yo.slot;
  const meToca = pago.status === 'pending' && pago.to_slot === yo && pago.created_by !== userId;
  const puedeDeshacer = sePuedeDeshacer(pago, userId);

  const accion = async (f: () => Promise<void>, alTerminar?: () => void) => {
    setOcupado(true);
    setError(null);
    try {
      await f();
      invalidar();
      alTerminar?.();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido completar. Inténtalo de nuevo.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <View style={styles.raiz}>
      {cabecera}
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.resumen}>
          <Text style={styles.quien}>{textoPago(pago, yo, p.nombrePareja)}</Text>
          <Text style={styles.importe}>{formatearImporte(pago.amount_cents)}</Text>
          <Text style={styles.datos}>
            {NOMBRE_METODO[pago.method]} · {fechaLarga(aISO(new Date(pago.created_at)))}
          </Text>
          <View style={[styles.estado, pago.status === 'rejected' && styles.estadoRechazado]}>
            <Text style={styles.estadoTexto}>
              {pago.status === 'rejected' && pago.from_slot === yo
                ? `${p.nombrePareja} dice que no lo ha recibido`
                : ESTADO_PAGO[pago.status]}
            </Text>
          </View>
        </View>

        {meToca ? (
          <View style={styles.acciones}>
            <BotonPrincipal etiqueta="Confirmar" cargando={ocupado} onPress={() => accion(() => responderPago(pago.id, true))} />
            <BotonSecundario etiqueta="No lo he recibido" deshabilitado={ocupado} onPress={() => accion(() => responderPago(pago.id, false))} />
          </View>
        ) : null}
        {puedeDeshacer ? (
          <EnlaceTexto etiqueta="Deshacer este pago" deshabilitado={ocupado} onPress={() => accion(() => deshacerPago(pago.id), volver)} />
        ) : null}
        <MensajeError texto={error} />

        {gastos.length ? (
          <>
            <Text accessibilityRole="header" style={styles.seccion}>
              {pago.status === 'rejected' ? 'GASTOS QUE INCLUÍA' : 'GASTOS QUE CUBRE'}
            </Text>
            <View style={styles.lista}>
              {gastos.map((g, i) => (
                <FilaGasto
                  key={g.id}
                  gasto={g}
                  pareja={pareja}
                  conFecha
                  separador={i < gastos.length - 1}
                  onPress={() => router.push({ pathname: '/gastos/[id]', params: { id: g.id } })}
                />
              ))}
            </View>
          </>
        ) : pago.status === 'rejected' ? (
          <Text style={styles.nota}>Los gastos han vuelto a estar pendientes.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colors.background },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  redondo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hueco: { width: 44 },
  titulo: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  noExiste: { marginTop: 40, textAlign: 'center', fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary },
  contenido: { paddingHorizontal: 20, gap: 12 },
  resumen: { alignItems: 'center', gap: 4, paddingVertical: 8 },
  quien: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.text },
  importe: { fontFamily: fonts.title, fontSize: 44, lineHeight: 50, color: colors.text },
  datos: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
  estado: { marginTop: 6, paddingVertical: 5, paddingHorizontal: 12, borderRadius: radius.full, backgroundColor: colors.surface },
  estadoRechazado: { backgroundColor: colors.accentSoft },
  estadoTexto: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  acciones: { gap: 8 },
  seccion: { marginTop: 8, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.textSecondary },
  lista: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl - 4, paddingHorizontal: 14 },
  nota: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
});
