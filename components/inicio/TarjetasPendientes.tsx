import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, radius } from '@/constants/theme';
import { formatearImporte } from '@/lib/dinero/importe';
import { ErrorGasto, type Pendiente, responderBorrado, responderPago } from '@/lib/gastos/consultas';
import { personas } from '@/lib/gastos/personas';
import { nombreMovimiento } from '@/lib/gastos/bote';
import { COMO_METODO } from '@/lib/gastos/saldar';
import { useInvalidarGastos, usePendientes } from '@/lib/gastos/useGastos';
import type { Pareja } from '@/lib/pareja/EstadoProvider';
import { useEstado } from '@/lib/pareja/EstadoProvider';

const PAUSA_RESULTADO_MS = 1800;

/** Sección «Pendiente» de Inicio (mockup Main): pagos por confirmar y borrados por aprobar. */
export function TarjetasPendientes() {
  const { pareja } = useEstado();
  const pendientes = usePendientes();
  // Al volver a Inicio se vuelve a preguntar: los avisos no dependen solo del tiempo real.
  const { refetch } = pendientes;
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );
  // Las ya respondidas se quedan un momento con su resultado, aunque el tiempo real ya las haya quitado (M5).
  const [resueltas, setResueltas] = useState<Map<string, { pendiente: Pendiente; texto: string }>>(new Map());
  const resolver = (pendiente: Pendiente, texto: string) => {
    setResueltas((m) => new Map(m).set(pendiente.id, { pendiente, texto }));
    setTimeout(
      () =>
        setResueltas((m) => {
          const n = new Map(m);
          n.delete(pendiente.id);
          return n;
        }),
      PAUSA_RESULTADO_MS,
    );
  };
  const lista = [...(pendientes.data ?? []).filter((p) => !resueltas.has(p.id)), ...[...resueltas.values()].map((r) => r.pendiente)];
  if (!pareja || lista.length === 0) return null;
  return (
    <View style={styles.seccion}>
      <Text accessibilityRole="header" style={styles.titulo}>
        PENDIENTE
      </Text>
      {lista.map((p) => (
        <Tarjeta key={p.id} pendiente={p} pareja={pareja} resultado={resueltas.get(p.id)?.texto ?? null} onResuelta={resolver} />
      ))}
    </View>
  );
}

function diasHasta(iso: string) {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

function Tarjeta({
  pendiente,
  pareja,
  resultado,
  onResuelta,
}: {
  pendiente: Pendiente;
  pareja: Pareja;
  resultado: string | null;
  onResuelta: (p: Pendiente, texto: string) => void;
}) {
  const router = useRouter();
  const invalidar = useInvalidarGastos();
  const p = personas(pareja);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const responder = async (f: () => Promise<void>, texto: string) => {
    setOcupado(true);
    setError(null);
    try {
      await f();
      onResuelta(pendiente, texto);
      invalidar();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido completar. Inténtalo de nuevo.');
      if (e instanceof ErrorGasto && (e.codigo === 'TW021' || e.codigo === 'TW062')) invalidar();
    } finally {
      setOcupado(false);
    }
  };

  let texto: React.ReactNode;
  let ayuda: string | null = null;
  let si: { etiqueta: string; accion: () => void };
  let no: { etiqueta: string; accion: () => void };
  let abrir: () => void;

  if (pendiente.tipo === 'pago') {
    const como = COMO_METODO[pendiente.pago.method];
    texto = (
      <>
        <Text style={[styles.nombre, { color: p.tintaPareja }]}>{p.nombrePareja}</Text> dice que te ha pagado{' '}
        <Text style={styles.importe}>{formatearImporte(pendiente.pago.amount_cents)}</Text>
        {como ? ` ${como}` : ''}
      </>
    );
    si = { etiqueta: 'Confirmar', accion: () => responder(() => responderPago(pendiente.id, true), 'Confirmado') };
    no = {
      etiqueta: 'No lo he recibido',
      accion: () => responder(() => responderPago(pendiente.id, false), `Avisaremos a ${p.nombrePareja}`),
    };
    abrir = () => router.push({ pathname: '/gastos/pago/[id]', params: { id: pendiente.id } });
  } else {
    const g = pendiente.gasto;
    const mov = pendiente.movimiento;
    const que = g
      ? `${g.concept} · ${formatearImporte(g.amount_cents)}`
      : mov
        ? `${nombreMovimiento(mov, p.yo.slot, p.nombrePareja)} · ${formatearImporte(mov.amount_cents)}`
        : pendiente.etiqueta;
    texto = (
      <>
        <Text style={[styles.nombre, { color: p.tintaPareja }]}>{p.nombrePareja}</Text> quiere borrar «{que}»
      </>
    );
    const dias = diasHasta(pendiente.solicitud.expires_at);
    ayuda = `Caduca en ${dias} ${dias === 1 ? 'día' : 'días'}. Si no respondes, ${mov ? 'el movimiento' : 'el gasto'} se queda.`;
    si = { etiqueta: 'Aprobar', accion: () => responder(() => responderBorrado(pendiente.id, true), 'Borrado') };
    no = {
      etiqueta: 'Rechazar',
      accion: () => responder(() => responderBorrado(pendiente.id, false), `Se queda · avisaremos a ${p.nombrePareja}`),
    };
    abrir = () =>
      g
        ? router.push({ pathname: '/gastos/[id]', params: { id: g.id } })
        : mov
          ? router.push({ pathname: '/gastos/movimiento/[id]', params: { id: mov.id } })
          : undefined;
  }

  return (
    <View style={styles.tarjeta}>
      <Pressable accessibilityRole="button" onPress={abrir} style={styles.cabecera}>
        <AvatarPersona nombre={p.nombrePareja} color={p.otra?.color ?? null} avatarPath={p.otra?.avatarPath} tamano={32} />
        <View style={styles.textos}>
          <Text style={styles.texto}>{texto}</Text>
          {ayuda ? <Text style={styles.ayuda}>{ayuda}</Text> : null}
        </View>
      </Pressable>
      {resultado ? (
        <Text style={styles.resultado} accessibilityLiveRegion="polite">
          {resultado}
        </Text>
      ) : (
        <View style={styles.botones}>
          <Pressable
            accessibilityRole="button"
            disabled={ocupado}
            onPress={si.accion}
            style={({ pressed }) => [styles.boton, styles.botonSi, pressed && { backgroundColor: colors.accentDark }, ocupado && styles.apagado]}
          >
            <Text style={styles.botonSiTexto}>{si.etiqueta}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={ocupado}
            onPress={no.accion}
            style={({ pressed }) => [styles.boton, styles.botonNo, pressed && { backgroundColor: colors.segmented }, ocupado && styles.apagado]}
          >
            <Text style={styles.botonNoTexto}>{no.etiqueta}</Text>
          </Pressable>
        </View>
      )}
      <MensajeError texto={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  seccion: { marginTop: 20, gap: 8 },
  titulo: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.textSecondary },
  tarjeta: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl - 4,
    padding: 14,
    gap: 12,
  },
  cabecera: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  textos: { flex: 1, gap: 3 },
  texto: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.text },
  nombre: { fontFamily: fonts.bodyBold },
  importe: { fontFamily: fonts.bodyBold },
  ayuda: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  botones: { flexDirection: 'row', gap: 8 },
  boton: { flex: 1, minHeight: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  botonSi: { backgroundColor: colors.accent },
  botonNo: { backgroundColor: colors.surface },
  botonSiTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.white },
  botonNoTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  apagado: { opacity: 0.5 },
  resultado: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingVertical: 10 },
});
