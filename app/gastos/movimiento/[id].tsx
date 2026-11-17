import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Hoja } from '@/components/gastos/Hoja';
import { BotonPrincipal, BotonSecundario, EnlaceTexto } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, radius } from '@/constants/theme';
import { formatearImporte } from '@/lib/dinero/importe';
import { efectoEnBote, nombreMovimiento } from '@/lib/gastos/bote';
import { ErrorGasto, pedirBorrar, responderBorrado, retirarBorrado } from '@/lib/gastos/consultas';
import { fechaLarga } from '@/lib/gastos/fechas';
import { personas } from '@/lib/gastos/personas';
import { useInvalidarGastos, useMovimiento, useSolicitudBorrado } from '@/lib/gastos/useGastos';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/** Detalle de un movimiento del bote, con pedir borrar (docs/plan-gastos-fase3.md §2). No se edita. */
export default function DetalleMovimiento() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pareja } = useEstado();
  const consulta = useMovimiento(id);
  const solicitud = useSolicitudBorrado(id, 'pot_movement');
  const invalidar = useInvalidarGastos();
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idSolicitud, setIdSolicitud] = useState(() => Crypto.randomUUID());

  const volver = () => (router.canGoBack() ? router.back() : router.replace('/gastos/bote'));
  const cabecera = (
    <View style={[styles.cabecera, { paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={volver} style={styles.redondo}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.titulo}>
        Movimiento del bote
      </Text>
      <View style={styles.hueco} />
    </View>
  );

  if (!pareja || consulta.isLoading) {
    return (
      <View style={styles.raiz}>
        {cabecera}
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      </View>
    );
  }
  const m = consulta.data;
  if (!m) {
    return (
      <View style={styles.raiz}>
        {cabecera}
        <Text style={styles.noExiste}>Este movimiento ya no existe.</Text>
      </View>
    );
  }

  const p = personas(pareja);
  const v = efectoEnBote(m);
  const s = solicitud.data;
  const alMomento = !p.otra;

  const accion = async (f: () => Promise<boolean | void>) => {
    setOcupado(true);
    setError(null);
    try {
      const borrado = await f();
      invalidar();
      setConfirmando(false);
      if (borrado === true) volver();
    } catch (e) {
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

  let borrar: React.ReactNode;
  if (s && s.requested_by === p.yo.userId) {
    borrar = (
      <View style={styles.banda}>
        <Text style={styles.bandaTexto}>
          Pendiente de borrar · esperando a <Text style={{ color: p.tintaPareja }}>{p.nombrePareja}</Text>. Sigue en el saldo del bote
          hasta que lo apruebe.
        </Text>
        <EnlaceTexto etiqueta="Retirar solicitud" deshabilitado={ocupado} onPress={() => accion(() => retirarBorrado(s.id))} />
      </View>
    );
  } else if (s) {
    borrar = (
      <View style={styles.caja}>
        <Text style={styles.cajaTitulo}>
          <Text style={{ color: p.tintaPareja }}>{p.nombrePareja}</Text> quiere borrar este movimiento
        </Text>
        <BotonPrincipal
          etiqueta="Aprobar"
          cargando={ocupado}
          onPress={() =>
            accion(async () => {
              await responderBorrado(s.id, true);
              return true;
            })
          }
        />
        <BotonSecundario etiqueta="Rechazar" deshabilitado={ocupado} onPress={() => accion(() => responderBorrado(s.id, false))} />
      </View>
    );
  } else {
    borrar = (
      <View style={{ alignItems: 'center' }}>
        <EnlaceTexto
          etiqueta={alMomento ? 'Borrar movimiento' : 'Pedir borrar este movimiento'}
          onPress={() => {
            setIdSolicitud(Crypto.randomUUID());
            setConfirmando(true);
          }}
        />
        <Text style={styles.nota}>
          {m.is_auto
            ? 'Si esta aportación no se llegó a hacer, pedid borrarla.'
            : 'Para corregir un importe, bórralo y apúntalo de nuevo.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.raiz}>
      {cabecera}
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.resumen}>
          <Text style={styles.nombre}>{nombreMovimiento(m, p.yo.slot, p.nombrePareja)}</Text>
          <Text style={styles.importe}>
            {v >= 0 ? '+' : '−'}
            {formatearImporte(Math.abs(v))}
          </Text>
          <Text style={styles.nota}>{fechaLarga(m.occurred_on)}</Text>
          {m.created_by && !m.is_auto ? (
            <Text style={styles.nota}>Apuntado por {m.created_by === p.yo.userId ? 'ti' : p.nombrePareja}</Text>
          ) : null}
        </View>
        <MensajeError texto={confirmando ? null : error} />
        {borrar}
      </ScrollView>

      <Hoja
        visible={confirmando}
        titulo={alMomento ? '¿Borrar este movimiento?' : '¿Pedir borrar este movimiento?'}
        onCerrar={() => setConfirmando(false)}
        bloqueada={ocupado}
      >
        <Text style={styles.cajaTexto}>
          {alMomento ? 'No se puede deshacer.' : `${p.nombrePareja} tendrá que aprobarlo. Si no responde en 7 días, el movimiento se queda.`}
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
              onPress={() => accion(async () => (await pedirBorrar(idSolicitud, m.id, 'pot_movement')).borrado)}
            />
          </View>
        </View>
      </Hoja>
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
  contenido: { paddingHorizontal: 20, gap: 14 },
  resumen: { alignItems: 'center', gap: 4, paddingVertical: 8 },
  nombre: { fontFamily: fonts.bodyMedium, fontSize: 17, color: colors.text, textAlign: 'center' },
  importe: { fontFamily: fonts.title, fontSize: 44, lineHeight: 50, color: colors.text },
  nota: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  banda: { gap: 4, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface },
  bandaTexto: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.text },
  caja: { gap: 10, padding: 16, borderRadius: radius.xl - 4, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  cajaTitulo: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  cajaTexto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.icon },
  dosBotones: { flexDirection: 'row', gap: 8 },
});
