import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Hoja } from '@/components/gastos/Hoja';
import { BotonPrincipal, BotonSecundario, EnlaceTexto } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, radius } from '@/constants/theme';
import { ErrorGasto, type TipoBorrable, pedirBorrar, responderBorrado, retirarBorrado } from '@/lib/gastos/consultas';
import { personas } from '@/lib/gastos/personas';
import { useInvalidarGastos, useSolicitudBorrado } from '@/lib/gastos/useGastos';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

/**
 * Borrar un gasto (docs/plan-gastos-fase2.md §5). Lo privado (o sin pareja) se borra al momento; lo compartido
 * necesita que la otra persona lo apruebe. Mientras tanto sigue contando en el saldo (decisión 1 de David).
 */
export function BorrarGasto({
  gasto,
  pareja,
  tipo = 'expense',
}: {
  /** Un gasto, o un pago recurrente (fase 4) con `tipo: 'recurring_payment'`. */
  gasto: { id: string; visible_to_partner: boolean; liquidacion?: unknown };
  pareja: Pareja;
  tipo?: TipoBorrable;
}) {
  const router = useRouter();
  const invalidar = useInvalidarGastos();
  const solicitud = useSolicitudBorrado(gasto.id, tipo);
  const cosa = tipo === 'recurring_payment' ? 'pago' : 'gasto';
  const p = personas(pareja);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un id por cada vez que se abre la confirmación: reintentar en ella no crea dos solicitudes, y volver a
  // pedirlo tras retirarlo o un rechazo crea una nueva (con el id viejo el servidor devolvería la antigua). I5.
  const [idSolicitud, setIdSolicitud] = useState(() => Crypto.randomUUID());
  const abrirConfirmacion = () => {
    setIdSolicitud(Crypto.randomUUID());
    setError(null);
    setConfirmando(true);
  };

  const volver = () => (router.canGoBack() ? router.back() : router.replace('/gastos'));
  const accion = async (f: () => Promise<boolean | void>) => {
    setOcupado(true);
    setError(null);
    try {
      const borrado = await f();
      invalidar();
      setConfirmando(false);
      if (borrado === true) volver();
    } catch (e) {
      // Tras un reintento, «no encontrado» quiere decir que ya se borró.
      if (e instanceof ErrorGasto && e.codigo === 'TW060') {
        invalidar();
        volver();
        return;
      }
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido completar. Inténtalo de nuevo.');
      invalidar();
    } finally {
      setOcupado(false);
    }
  };

  if (gasto.liquidacion) {
    return <Text style={styles.nota}>Saldado: no se puede borrar.</Text>;
  }

  const s = solicitud.data;
  if (s && s.requested_by === p.yo.userId) {
    return (
      <View style={styles.banda} accessibilityRole="summary">
        <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
        <View style={styles.bandaTextos}>
          <Text style={styles.bandaTitulo}>
            Pendiente de borrar · esperando a <Text style={{ color: p.tintaPareja }}>{p.nombrePareja}</Text>
          </Text>
          <Text style={styles.bandaAyuda}>
            {tipo === 'recurring_payment'
              ? `Se sigue apuntando hasta que ${p.nombrePareja} lo apruebe.`
              : `Sigue en vuestro saldo hasta que ${p.nombrePareja} lo apruebe. No se puede saldar mientras tanto.`}
          </Text>
          <MensajeError texto={error} />
        </View>
        <Pressable accessibilityRole="button" disabled={ocupado} onPress={() => accion(() => retirarBorrado(s.id))} style={styles.bandaBoton}>
          <Text style={styles.bandaEnlace}>Retirar</Text>
        </Pressable>
      </View>
    );
  }
  if (s) {
    return (
      <View style={styles.caja}>
        <Text style={styles.cajaTitulo}>
          <Text style={{ color: p.tintaPareja }}>{p.nombrePareja}</Text> quiere borrar este {cosa}
        </Text>
        <Text style={styles.bandaAyuda}>Si no respondes en 7 días, el {cosa} se queda.</Text>
        <MensajeError texto={error} />
        <BotonPrincipal etiqueta="Aprobar" cargando={ocupado} onPress={() => accion(async () => {
          await responderBorrado(s.id, true);
          return true;
        })} />
        <BotonSecundario etiqueta="Rechazar" deshabilitado={ocupado} onPress={() => accion(() => responderBorrado(s.id, false))} />
      </View>
    );
  }

  // Al momento: lo privado, o si la pareja aún no se ha unido o ya salió (el servidor decide igual).
  const alMomento = !gasto.visible_to_partner || !p.otra;

  return (
    <View style={styles.pie}>
      <EnlaceTexto etiqueta={alMomento ? `Borrar ${cosa}` : `Pedir borrar este ${cosa}`} onPress={abrirConfirmacion} />
      {!alMomento ? <Text style={styles.nota}>{p.nombrePareja} tendrá que aprobarlo</Text> : null}
      {/* Mockup DetalleGasto: la confirmación es una hoja inferior. */}
      <Hoja
        visible={confirmando}
        titulo={alMomento ? `¿Borrar este ${cosa}?` : `¿Pedir borrar este ${cosa}?`}
        onCerrar={() => setConfirmando(false)}
        bloqueada={ocupado}
      >
        <Text style={styles.cajaTexto}>
          {alMomento ? 'No se puede deshacer.' : `${p.nombrePareja} tendrá que aprobarlo. Si no responde en 7 días, el ${cosa} se queda.`}
          {tipo === 'recurring_payment' ? ' Los gastos que ya se apuntaron se quedan.' : ''}
        </Text>
        <MensajeError texto={error} />
        <View style={styles.dosBotones}>
          <View style={{ flex: 1 }}>
            <BotonSecundario etiqueta="Cancelar" deshabilitado={ocupado} onPress={() => setConfirmando(false)} />
          </View>
          <View style={{ flex: 1 }}>
            <BotonPrincipal
              etiqueta={alMomento ? 'Borrar' : 'Enviar solicitud'}
              cargando={ocupado}
              onPress={() => accion(async () => (await pedirBorrar(idSolicitud, gasto.id, tipo)).borrado)}
            />
          </View>
        </View>
      </Hoja>
    </View>
  );
}

const styles = StyleSheet.create({
  pie: { alignItems: 'center', marginTop: 8 },
  nota: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
  banda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  bandaTextos: { flex: 1, gap: 2 },
  bandaTitulo: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  bandaAyuda: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  bandaBoton: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, justifyContent: 'center' },
  bandaEnlace: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.accent },
  caja: {
    gap: 10,
    padding: 16,
    borderRadius: radius.xl - 4,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cajaTitulo: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  cajaTexto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.icon },
  dosBotones: { flexDirection: 'row', gap: 8 },
});
