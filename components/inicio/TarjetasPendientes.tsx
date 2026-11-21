import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, radius } from '@/constants/theme';
import { textosCambios } from '@/lib/ajustes/ajustes';
import { responderPropuesta } from '@/lib/ajustes/consultas';
import { HojaQuienPago } from '@/components/calendario/HojaQuienPago';
import { HojaImporte } from '@/components/gastos/HojaImporte';
import { descartarQuienPago } from '@/lib/calendario/consultas';
import { usePresupuestos } from '@/lib/ajustes/presupuestos';
import { lineaQuienPago } from '@/lib/calendario/quienPago';
import { fechaCorta } from '@/lib/gastos/fechas';
import { saltarCobro } from '@/lib/gastos/consultasRecurrentes';
import { importeRecurrente } from '@/lib/gastos/recurrentes';
import { formatearImporte } from '@/lib/dinero/importe';
import { ErrorGasto, type Pendiente, responderBorrado, responderPago } from '@/lib/gastos/consultas';
import { personas } from '@/lib/gastos/personas';
import { contarPendientes, cosaBorrada, descripcionBorrado } from '@/lib/gastos/pendientes';
import { QuienPagoEnLinea } from '@/components/inicio/QuienPagoEnLinea';
import { RecuadroPendientes } from '@/components/inicio/RecuadroPendientes';
import { COMO_METODO } from '@/lib/gastos/saldar';
import { useInvalidarGastos, usePendientes } from '@/lib/gastos/useGastos';
import type { Pareja } from '@/lib/pareja/EstadoProvider';
import { useEstado } from '@/lib/pareja/EstadoProvider';

const PAUSA_RESULTADO_MS = 1800;

/**
 * Sección «Pendiente» (Inicio y Gastos): pagos por confirmar, borrados por aprobar (gastos, movimientos del bote, eventos y pagos recurrentes), cobros variables, cambios de ajustes y «¿Quién pagó?» de eventos.
 * Con 2 o más avisos se agrupan en un recuadro que se despliega al tocarlo.
 */
export function TarjetasPendientes({ compacta = false }: { /** Sin margen superior grande (Gastos ya separa sus bloques). */ compacta?: boolean }) {
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
  // Plegado/desplegado del grupo: estado local, plegado por defecto; no se pliega solo al responder un aviso.
  const [expandido, setExpandido] = useState(false);
  const reales = (pendientes.data ?? []).filter((p) => !resueltas.has(p.id));
  const lista = [...reales, ...[...resueltas.values()].map((r) => r.pendiente)];
  if (!pareja || lista.length === 0) return null;
  const tarjetas = lista.map((p) => (
    <Tarjeta key={p.id} pendiente={p} pareja={pareja} resultado={resueltas.get(p.id)?.texto ?? null} onResuelta={resolver} />
  ));
  // El conteo solo incluye los pendientes de verdad: con 1 (o solo respondidos) se muestran las tarjetas directamente.
  const agrupar = contarPendientes(pendientes.data ?? [], new Set(resueltas.keys())) >= 2;
  return (
    <View style={[styles.seccion, compacta && styles.seccionCompacta]}>
      <Text accessibilityRole="header" style={styles.titulo}>
        PENDIENTE
      </Text>
      {agrupar ? (
        <RecuadroPendientes avisos={reales} pareja={pareja} expandido={expandido} onAlternar={() => setExpandido((e) => !e)}>
          {tarjetas}
        </RecuadroPendientes>
      ) : (
        tarjetas
      )}
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
  const presupuestos = usePresupuestos();
  const invalidar = useInvalidarGastos();
  const p = personas(pareja);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [poniendoImporte, setPoniendoImporte] = useState(false);
  const [apuntando, setApuntando] = useState(false);

  const responder = async (f: () => Promise<void>, texto: string) => {
    setOcupado(true);
    setError(null);
    try {
      await f();
      onResuelta(pendiente, texto);
      invalidar();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido completar. Inténtalo de nuevo.');
      if (e instanceof ErrorGasto && ['TW021', 'TW062', 'TW030', 'TW032', 'TW081', 'TW060'].includes(e.codigo ?? '')) invalidar();
    } finally {
      setOcupado(false);
    }
  };

  let texto: React.ReactNode;
  let ayuda: string | null = null;
  let lineas: string[] = [];
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
  } else if (pendiente.tipo === 'cobro') {
    const r = pendiente.recurrente;
    texto = (
      <>
        Ha llegado <Text style={styles.importe}>{r.name}</Text> ({importeRecurrente(r)}). Pon el importe de la factura.
      </>
    );
    si = { etiqueta: 'Poner importe', accion: () => setPoniendoImporte(true) };
    no = { etiqueta: 'Este mes no', accion: () => responder(() => saltarCobro(pendiente.id, true), 'Saltado este mes') };
    abrir = () => router.push({ pathname: '/gastos/recurrente/[id]', params: { id: r.id } });
  } else if (pendiente.tipo === 'quienPago') {
    const e = pendiente.evento;
    texto = (
      <>
        ¿Quién pagó <Text style={styles.importe}>{e.title}</Text>?
      </>
    );
    ayuda = lineaQuienPago(fechaCorta(e.start_date), e.budget_cents, presupuestos);
    si = { etiqueta: 'Apuntar', accion: () => setApuntando(true) };
    no = { etiqueta: 'No hubo gasto', accion: () => responder(() => descartarQuienPago(e.id), 'Sin gasto') };
    abrir = () => router.push({ pathname: '/calendario/evento/[id]', params: { id: e.id } });
  } else if (pendiente.tipo === 'propuesta') {
    texto = (
      <>
        <Text style={[styles.nombre, { color: p.tintaPareja }]}>{p.nombrePareja}</Text> propone cambiar vuestros ajustes:
      </>
    );
    lineas = textosCambios(pendiente.actual, pendiente.propuesta.changes, p.yo.slot, p.nombrePareja);
    if (lineas.length === 0) lineas = ['Nada: ya está así'];
    si = { etiqueta: 'Aceptar', accion: () => responder(() => responderPropuesta(pendiente.id, true), 'Aceptado') };
    no = {
      etiqueta: 'Rechazar',
      accion: () => responder(() => responderPropuesta(pendiente.id, false), `Se queda como estaba · avisaremos a ${p.nombrePareja}`),
    };
    abrir = () => router.push('/ajustes');
  } else {
    const que = descripcionBorrado(pendiente, p.yo.slot, p.nombrePareja);
    texto = (
      <>
        <Text style={[styles.nombre, { color: p.tintaPareja }]}>{p.nombrePareja}</Text> quiere borrar «{que}»
      </>
    );
    const dias = diasHasta(pendiente.solicitud.expires_at);
    ayuda = `Caduca en ${dias} ${dias === 1 ? 'día' : 'días'}. Si no respondes, ${cosaBorrada(pendiente)} se queda.`;
    si = { etiqueta: 'Aprobar', accion: () => responder(() => responderBorrado(pendiente.id, true), 'Borrado') };
    no = {
      etiqueta: 'Rechazar',
      accion: () => responder(() => responderBorrado(pendiente.id, false), `Se queda · avisaremos a ${p.nombrePareja}`),
    };
    abrir = () => {
      const g = pendiente.gasto;
      const mov = pendiente.movimiento;
      if (pendiente.objetivo === 'event') {
        router.push({
          pathname: '/calendario/evento/[id]',
          params: { id: pendiente.objetivoId, ...(pendiente.fecha ? { fecha: pendiente.fecha } : {}) },
        });
      } else if (pendiente.objetivo === 'plan') {
        router.push({ pathname: '/planificador/[id]', params: { id: pendiente.objetivoId } });
      } else if (pendiente.objetivo === 'recurring_payment') {
        router.push({ pathname: '/gastos/recurrente/[id]', params: { id: pendiente.objetivoId } });
      } else if (g) {
        router.push({ pathname: '/gastos/[id]', params: { id: g.id } });
      } else if (mov) {
        router.push({ pathname: '/gastos/movimiento/[id]', params: { id: mov.id } });
      }
    };
  }

  return (
    <View style={styles.tarjeta}>
      <Pressable accessibilityRole="button" onPress={abrir} style={styles.cabecera}>
        {pendiente.tipo === 'cobro' || pendiente.tipo === 'quienPago' ? (
          <View style={styles.icono}>
            <Ionicons name={pendiente.tipo === 'cobro' ? 'repeat-outline' : 'wallet-outline'} size={18} color={colors.icon} />
          </View>
        ) : (
          <AvatarPersona nombre={p.nombrePareja} color={p.otra?.color ?? null} avatarPath={p.otra?.avatarPath} tamano={32} />
        )}
        <View style={styles.textos}>
          <Text style={styles.texto}>{texto}</Text>
          {lineas.map((l) => (
            <Text key={l} style={styles.linea}>
              · {l}
            </Text>
          ))}
          {ayuda ? <Text style={styles.ayuda}>{ayuda}</Text> : null}
        </View>
      </Pressable>
      {resultado ? (
        <Text style={styles.resultado} accessibilityLiveRegion="polite">
          {resultado}
        </Text>
      ) : pendiente.tipo === 'quienPago' && !pendiente.evento.is_secret ? (
        <>
          <QuienPagoEnLinea
            evento={{
              id: pendiente.evento.id,
              title: pendiente.evento.title,
              budget_cents: pendiente.evento.budget_cents,
              is_secret: pendiente.evento.is_secret,
              fecha: pendiente.evento.start_date,
              category: pendiente.evento.category,
            }}
            pareja={pareja}
            deshabilitado={ocupado}
            onMas={() => setApuntando(true)}
            onHecho={(texto) => onResuelta(pendiente, texto)}
          />
          <Pressable accessibilityRole="button" disabled={ocupado} onPress={no.accion} style={styles.sinGasto}>
            <Text style={styles.sinGastoTexto}>No hubo gasto</Text>
          </Pressable>
        </>
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
      {poniendoImporte && pendiente.tipo === 'cobro' ? (
        <HojaImporte
          cobro={pendiente.cobro}
          recurrente={pendiente.recurrente}
          pareja={pareja}
          onCerrar={() => setPoniendoImporte(false)}
          onHecho={() => {
            setPoniendoImporte(false);
            onResuelta(pendiente, 'Apuntado');
            invalidar();
          }}
        />
      ) : null}
      {apuntando && pendiente.tipo === 'quienPago' ? (
        <HojaQuienPago
          evento={{
            id: pendiente.evento.id,
            title: pendiente.evento.title,
            budget_cents: pendiente.evento.budget_cents,
            is_secret: pendiente.evento.is_secret,
            fecha: pendiente.evento.start_date,
            category: pendiente.evento.category,
          }}
          pareja={pareja}
          modo="pregunta"
          onCerrar={() => setApuntando(false)}
          onHecho={(r) => {
            setApuntando(false);
            onResuelta(pendiente, r === 'gasto' ? 'Gasto apuntado' : 'Sin gasto');
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  seccion: { marginTop: 20, gap: 8 },
  seccionCompacta: { marginTop: 0 },
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
  icono: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  textos: { flex: 1, gap: 3 },
  texto: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.text },
  nombre: { fontFamily: fonts.bodyBold },
  importe: { fontFamily: fonts.bodyBold },
  linea: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.text },
  ayuda: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  botones: { flexDirection: 'row', gap: 8 },
  boton: { flex: 1, minHeight: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  botonSi: { backgroundColor: colors.accent },
  botonNo: { backgroundColor: colors.surface },
  botonSiTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.white },
  botonNoTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  apagado: { opacity: 0.5 },
  sinGasto: { minHeight: 36, alignItems: 'center', justifyContent: 'center', marginTop: -6 },
  sinGastoTexto: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textSecondary },
  resultado: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingVertical: 10 },
});
