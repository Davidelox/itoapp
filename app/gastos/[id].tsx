import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { BorrarGasto } from '@/components/gastos/BorrarGasto';
import { IconoCategoria, textoPagador } from '@/components/gastos/FilaGasto';
import { EmojiIcono } from '@/components/mapa/EmojiIcono';
import { SitioEnlazado } from '@/components/mapa/SitioEnlazado';
import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { colors, fonts, radius } from '@/constants/theme';
import { useEvento } from '@/lib/calendario/useCalendario';
import { formatearImporte } from '@/lib/dinero/importe';
import { INFO_CATEGORIA } from '@/lib/gastos/categorias';
import { aISO, fechaLarga } from '@/lib/gastos/fechas';
import { planDe } from '@/lib/gastos/planes';
import { personas } from '@/lib/gastos/personas';
import { COMO_METODO } from '@/lib/gastos/saldar';
import { etiquetaReparto, fraseResultado, partesDeYo, pctDeYo } from '@/lib/gastos/reparto';
import { useGasto, useOrigenRecurrente } from '@/lib/gastos/useGastos';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/** Detalle de un gasto (mockup DetalleGasto). Las partes son las que guardó el servidor, nunca recalculadas. */
export default function DetalleGasto() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pareja } = useEstado();
  const consulta = useGasto(id);
  const gasto = consulta.data;

  const volver = () => (router.canGoBack() ? router.back() : router.replace('/gastos'));

  const cabecera = (
    <View style={[styles.cabecera, { paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={volver} style={styles.redondo}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.tituloCabecera}>
        Gasto
      </Text>
      {gasto ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/gastos/editar/[id]', params: { id: gasto.id } })}
          style={styles.editar}
        >
          <Text style={styles.editarTexto}>Editar</Text>
        </Pressable>
      ) : (
        <View style={styles.redondoHueco} />
      )}
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
  if (!gasto) {
    return (
      <View style={styles.raiz}>
        {cabecera}
        <Text style={styles.noExiste}>{consulta.isError ? 'No se ha podido cargar el gasto.' : 'Este gasto ya no existe.'}</Text>
      </View>
    );
  }

  const p = personas(pareja);
  const yo = p.yo.slot;
  const servidor = { m1: gasto.share_m1_cents, m2: gasto.share_m2_cents, pot: gasto.share_pot_cents };
  const mias = partesDeYo(yo, servidor);
  const pagador = textoPagador(gasto, pareja);
  const efecto = fraseResultado(yo, gasto.paid_by, servidor, p.nombrePareja, 'presente');
  const reparto = etiquetaReparto(gasto.split_mode, yo, gasto.split_pct_m1, p.nombrePareja);
  const pctYo =
    gasto.split_mode === 'pot'
      ? 0
      : gasto.split_mode === 'only_m1' || gasto.split_mode === 'only_m2'
        ? mias.yo > 0
          ? 100
          : 0
        : pctDeYo(yo, gasto.split_pct_m1 ?? 50);
  const plan = planDe(gasto);
  const apuntadoPorPareja = gasto.created_by !== null && gasto.created_by !== p.yo.userId;
  const miembroPagador = gasto.paid_by === yo ? p.yo : gasto.paid_by === 'pot' ? null : p.otra;

  return (
    <View style={styles.raiz}>
      {cabecera}
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.resumen}>
          <IconoCategoria categoria={gasto.category} tamano={56} />
          <Text style={styles.concepto}>{gasto.concept}</Text>
          <Text style={styles.importe}>{formatearImporte(gasto.amount_cents)}</Text>
          <Text style={styles.fecha}>
            {fechaLarga(gasto.spent_on)} · {INFO_CATEGORIA[gasto.category].nombre}
          </Text>
          {!gasto.visible_to_partner ? (
            <View style={styles.etiqueta}>
              <Ionicons name="lock-closed-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.etiquetaTexto}>Solo lo ves tú</Text>
            </View>
          ) : null}
          {apuntadoPorPareja ? <Text style={styles.apuntado}>Apuntado por {p.nombrePareja}</Text> : null}
        </View>

        <View style={styles.tarjeta}>
          <Text accessibilityRole="header" style={styles.seccion}>
            REPARTO · {reparto.toUpperCase()}
          </Text>
          <View style={styles.filaPagador}>
            {miembroPagador ? (
              <AvatarPersona
                nombre={miembroPagador === p.yo ? p.yo.nombre : p.nombrePareja}
                color={miembroPagador.color}
                avatarPath={miembroPagador.avatarPath}
                tamano={36}
              />
            ) : (
              <View style={styles.boteIcono}>
                <Ionicons name="server-outline" size={18} color={colors.icon} />
              </View>
            )}
            <Text style={[styles.pagador, { color: pagador.color }]}>{pagador.texto}</Text>
            <Text style={styles.pagadorImporte}>{formatearImporte(gasto.amount_cents)}</Text>
          </View>
          <View style={styles.partes}>
            {gasto.split_mode !== 'pot' ? (
              <>
                <Parte etiqueta={`Tu parte (${pctYo} %)`} importe={mias.yo} color={p.tintaYo} />
                <Parte etiqueta={`Parte de ${p.nombrePareja} (${100 - pctYo} %)`} importe={mias.pareja} color={p.tintaPareja} />
              </>
            ) : null}
            {mias.bote > 0 ? <Parte etiqueta="Parte del bote (100 %)" importe={mias.bote} color={colors.text} /> : null}
          </View>
          <View style={styles.efecto}>
            <Text style={styles.efectoTexto}>{efecto.texto}</Text>
            <Text style={styles.efectoAyuda}>
              {gasto.liquidacion?.status === 'confirmed'
                ? 'Saldado'
                : gasto.liquidacion
                  ? 'Pago pendiente de confirmar: sigue en vuestro saldo'
                  : efecto.quien === 'nadie' ? 'No cambia vuestro saldo' : 'Incluido en vuestro saldo'}
            </Text>
          </View>
        </View>

        {gasto.liquidacion ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/gastos/pago/[id]', params: { id: gasto.liquidacion?.id ?? '' } })}
            style={styles.saldado}
          >
            <Ionicons
              name={gasto.liquidacion.status === 'confirmed' ? 'checkmark-circle-outline' : 'time-outline'}
              size={20}
              color={colors.icon}
            />
            <Text style={styles.saldadoTexto}>
              {gasto.liquidacion.status === 'confirmed' ? 'Saldado' : 'Pendiente de confirmar'}
              {COMO_METODO[gasto.liquidacion.method] ? ` · ${COMO_METODO[gasto.liquidacion.method]}` : ''} el{' '}
              {fechaLarga(aISO(new Date(gasto.liquidacion.created_at))).toLowerCase()}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}

        {gasto.place_id ? (
          <View style={styles.saldado}>
            <Ionicons name="location-outline" size={20} color={colors.icon} />
            <View style={styles.sitio}>
              <SitioEnlazado placeId={gasto.place_id} />
            </View>
          </View>
        ) : null}

        {plan ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={plan.id ? `Plan: ${plan.nombre}` : `Plan: ${plan.nombre} (ya no existe)`}
            accessibilityHint={plan.id ? 'Abre el plan' : undefined}
            disabled={!plan.id}
            onPress={() => router.push({ pathname: '/planificador/[id]', params: { id: plan.id ?? '' } })}
            style={styles.saldado}
          >
            <EmojiIcono emoji={plan.icono} size={22} />
            <Text style={[styles.saldadoTexto, !plan.id && { color: colors.textSecondary }]}>
              Plan: {plan.nombre}
              {plan.id ? '' : ' (ya no existe)'}
            </Text>
            {plan.id ? <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} /> : null}
          </Pressable>
        ) : null}

        <OrigenRecurrente cobroId={gasto.recurring_occurrence_id} />

        <OrigenEvento eventoId={gasto.event_id} titulo={gasto.event_title_snapshot} />

        <BorrarGasto gasto={gasto} pareja={pareja} />
      </ScrollView>
    </View>
  );
}

/** «De un pago recurrente: Netflix», que abre el recurrente (fase 4). */
function OrigenRecurrente({ cobroId }: { cobroId: string | null }) {
  const router = useRouter();
  const origen = useOrigenRecurrente(cobroId);
  if (!cobroId || !origen.data) return null;
  const r = origen.data;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/gastos/recurrente/[id]', params: { id: r.id } })}
      style={styles.saldado}
    >
      <Ionicons name="repeat-outline" size={20} color={colors.icon} />
      <Text style={styles.saldadoTexto}>De un pago recurrente: {r.name}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

/**
 * «Evento: Cena en Taberna», que abre el evento. Si ya no existe, o es un secreto que no ves (la consulta
 * devuelve null), el título que guardó el servidor, como texto y sin enlace. El servidor no copia el título de
 * un secreto en gastos compartidos: sin título guardado no se enseña nada (el gasto no revela el evento).
 */
function OrigenEvento({ eventoId, titulo }: { eventoId: string | null; titulo: string | null }) {
  const router = useRouter();
  const evento = useEvento(eventoId ?? undefined);
  if (eventoId && evento.isLoading) return null;
  if (evento.data) {
    const id = evento.data.id;
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/calendario/evento/[id]', params: { id } })}
        style={styles.saldado}
      >
        <Ionicons name="calendar-outline" size={20} color={colors.icon} />
        <Text style={styles.saldadoTexto}>Evento: {evento.data.title}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>
    );
  }
  if (!titulo) return null;
  return (
    <View style={styles.saldado} accessible>
      <Ionicons name="calendar-outline" size={20} color={colors.icon} />
      <Text style={styles.saldadoTexto}>Evento: {titulo}</Text>
    </View>
  );
}

function Parte({ etiqueta, importe, color }: { etiqueta: string; importe: number; color: string }) {
  return (
    <View style={styles.parte}>
      <Text style={[styles.parteEtiqueta, { color }]}>{etiqueta}</Text>
      <Text style={styles.parteImporte}>{formatearImporte(importe)}</Text>
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
  redondoHueco: { width: 44 },
  tituloCabecera: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  editar: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  editarTexto: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.accent },
  noExiste: { marginTop: 40, textAlign: 'center', fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary },
  sitio: { flex: 1 },
  contenido: { paddingHorizontal: 20, gap: 14 },
  resumen: { alignItems: 'center', gap: 4, paddingTop: 4 },
  concepto: { marginTop: 6, fontFamily: fonts.bodyMedium, fontSize: 18, color: colors.text, textAlign: 'center' },
  importe: { fontFamily: fonts.title, fontSize: 44, lineHeight: 50, color: colors.text },
  fecha: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
  etiqueta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  etiquetaTexto: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondary },
  apuntado: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  tarjeta: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl - 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  seccion: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.textSecondary },
  filaPagador: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  boteIcono: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  pagador: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15 },
  pagadorImporte: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  partes: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.divider },
  parte: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  parteEtiqueta: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 14 },
  parteImporte: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  efecto: { minHeight: 44, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface },
  efectoTexto: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  saldado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  saldadoTexto: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  efectoAyuda: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
});
