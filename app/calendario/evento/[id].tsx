import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BloqueDespues } from '@/components/calendario/BloqueDespues';
import { HojaRevelar } from '@/components/calendario/HojaRevelar';
import { Marcador } from '@/components/calendario/Marcador';
import { BorrarGasto } from '@/components/gastos/BorrarGasto';
import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { BotonSecundario } from '@/components/onboarding/Botones';
import { colors, fonts, radius } from '@/constants/theme';
import { coloresDeHuecos, marcador } from '@/lib/calendario/colores';
import { revelarEvento } from '@/lib/calendario/consultas';
import {
  INFO_CATEGORIA_EVENTO,
  textoAsistentes,
  textoAviso,
  textoCuando,
  textoCuandoCumple,
  textoDeParte,
  textoEnCurso,
  textoSerie,
  textoVariosDias,
} from '@/lib/calendario/evento';
import { diasEntre, sumarDias } from '@/lib/calendario/rejilla';
import { proximaRepeticion, textoRepeticion } from '@/lib/calendario/repeticion';
import { useEvento } from '@/lib/calendario/useCalendario';
import { formatearImporte } from '@/lib/dinero/importe';
import { ErrorGasto } from '@/lib/gastos/consultas';
import { aISO, deISO, hoyISO } from '@/lib/gastos/fechas';
import { personas } from '@/lib/gastos/personas';
import { useInvalidarGastos } from '@/lib/gastos/useGastos';
import { useEstado } from '@/lib/pareja/EstadoProvider';

const esFecha = (s: string | undefined): s is string => !!s && aISO(deISO(s)) === s;

/**
 * Detalle de un evento o un cumpleaños (mockup DetalleEvento, docs/plan-calendario.md §2 y
 * docs/plan-calendario-v2.md §2.5). `?fecha=` es el INICIO de la repetición que se ha tocado en el calendario
 * (en un viaje de varios días, su primer día, nunca el día tocado); sin ella (p. ej. desde una tarjeta) se
 * enseña la próxima. El bloque «Después del evento» (¿Quién pagó? y gastos enlazados) es la fase C.
 */
export default function DetalleEvento() {
  const { id, fecha: fechaParam } = useLocalSearchParams<{ id: string; fecha?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const invalidar = useInvalidarGastos();
  const { pareja } = useEstado();
  const consulta = useEvento(id);
  const evento = consulta.data;
  const [revelando, setRevelando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [errorRevelar, setErrorRevelar] = useState<string | null>(null);

  const volver = () => (router.canGoBack() ? router.back() : router.replace('/calendario'));

  const cabecera = (
    <View style={[styles.cabecera, { paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={volver} style={styles.redondo}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.tituloCabecera}>
        {evento?.category === 'birthday' ? 'Cumpleaños' : 'Evento'}
      </Text>
      {evento ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/calendario/editar/[id]', params: { id: evento.id } })}
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
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      </View>
    );
  }
  if (!evento) {
    return (
      <View style={styles.raiz}>
        {cabecera}
        <Text style={styles.noExiste}>{consulta.isError ? 'No se ha podido cargar el evento.' : 'Este evento ya no existe.'}</Text>
      </View>
    );
  }

  const p = personas(pareja);
  const yo = p.yo.slot;
  const hoy = hoyISO();
  const repite = evento.recurrence !== 'none';
  const cumple = evento.category === 'birthday';
  // Días que se suman al primero (un viaje del 14 al 16 dura 2): la repetición en curso aún cuenta como próxima.
  const duracion = evento.end_date ? diasEntre(evento.start_date, evento.end_date) : 0;
  // La repetición que se mira: la de `?fecha=` (su inicio); sin ella, la próxima (o la primera si la serie ya acabó).
  const fecha = !repite
    ? evento.start_date
    : esFecha(fechaParam)
      ? fechaParam
      : (proximaRepeticion(evento.start_date, evento.recurrence, null, hoy, duracion) ?? evento.start_date);
  // Último día de esa repetición.
  const fin = duracion > 0 ? sumarDias(fecha, duracion) : fecha;
  const serie = cumple ? 'Cada año' : textoSerie(evento.recurrence);
  const titulo = cumple ? `Cumpleaños de ${evento.title}` : evento.title;
  const quien = cumple ? textoDeParte(evento.attendees, yo, p.nombrePareja) : textoAsistentes(evento.attendees, yo, p.nombrePareja);
  const colores = coloresDeHuecos(pareja);
  const marca = marcador({ tipo: 'event', categoria: evento.category, asistentes: evento.attendees }, colores.m1, colores.m2);
  const categoria = INFO_CATEGORIA_EVENTO[evento.category];
  const enCurso = duracion > 0 ? textoEnCurso(fecha, fin, hoy) : null;
  // Sin pareja unida, «Vais los dos» no dice nada.
  const mostrarQuien = !!p.otra || evento.attendees !== 'both';
  const vaYo = evento.attendees === 'both' || evento.attendees === yo;
  const vaPareja = !!p.otra && (evento.attendees === 'both' || evento.attendees !== yo);

  const revelar = async () => {
    setOcupado(true);
    setErrorRevelar(null);
    try {
      await revelarEvento(evento.id, evento.version, p.nombrePareja);
      await invalidar();
      setRevelando(false);
    } catch (e) {
      setErrorRevelar(e instanceof ErrorGasto ? e.message : 'No se ha podido revelar. Inténtalo de nuevo.');
      invalidar();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <View style={styles.raiz}>
      {cabecera}
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 24 }]}>
        <BorrarGasto
          gasto={{ id: evento.id, visible_to_partner: !evento.is_secret }}
          pareja={pareja}
          tipo="event"
          fecha={cumple ? null : fecha}
          fin={cumple ? null : fin}
          repetido={repite && !cumple}
          nombre={cumple ? 'cumpleaños' : undefined}
          parte="banda"
        />

        <Text accessibilityRole="header" style={styles.titulo}>
          {titulo}
        </Text>

        {categoria.icono && !cumple ? (
          <View style={styles.categoria} accessible accessibilityLabel={`Categoría: ${categoria.etiqueta}`}>
            <Ionicons name={categoria.icono} size={14} color={colors.text} />
            <Text style={styles.categoriaTexto}>{categoria.etiqueta}</Text>
          </View>
        ) : null}

        <View style={styles.tarjeta}>
          <Fila icono="calendar-outline">
            <Text style={styles.filaTexto}>
              {cumple
                ? textoCuandoCumple(fecha, evento.birth_year, hoy)
                : duracion > 0
                  ? textoVariosDias(fecha, fin)
                  : textoCuando(fecha, evento.start_time, evento.all_day, hoy)}
            </Text>
            {enCurso ? <Text style={styles.ayuda}>{enCurso}</Text> : null}
          </Fila>
          {serie ? (
            <Fila icono="repeat-outline">
              <Text style={styles.filaTexto}>{serie}</Text>
              <Text style={styles.ayuda}>{textoRepeticion(evento.recurrence, evento.start_date)}</Text>
            </Fila>
          ) : null}
          {cumple && mostrarQuien ? (
            <Fila icono="gift-outline">
              <View style={styles.quien}>
                <Marcador marcador={marca} tamano={12} />
                <Text style={styles.filaTexto}>{quien}</Text>
              </View>
            </Fila>
          ) : null}
          {!cumple && mostrarQuien ? (
            <Fila icono="people-outline">
              <View style={styles.quien}>
                <Marcador marcador={marca} tamano={10} />
                <View style={styles.avatares}>
                  {vaYo ? (
                    <AvatarPersona nombre={p.yo.nombre} color={p.yo.color} avatarPath={p.yo.avatarPath} tamano={28} />
                  ) : null}
                  {vaPareja ? (
                    <View style={vaYo ? styles.solapado : undefined}>
                      <AvatarPersona nombre={p.nombrePareja} color={p.otra?.color ?? null} avatarPath={p.otra?.avatarPath} tamano={28} />
                    </View>
                  ) : null}
                </View>
                <Text style={styles.filaTexto}>{quien}</Text>
              </View>
            </Fila>
          ) : null}
          {evento.budget_cents !== null ? (
            <Fila icono="wallet-outline">
              <Text style={styles.filaTexto}>Presupuesto {formatearImporte(evento.budget_cents)}</Text>
            </Fila>
          ) : null}
          {evento.is_secret ? (
            <Fila icono="lock-closed-outline">
              <Text style={styles.filaTexto}>Secreto · solo lo ves tú</Text>
            </Fila>
          ) : null}
        </View>

        {cumple ? null : <BloqueDespues evento={evento} fecha={fecha} pareja={pareja} />}

        {evento.notes ? (
          <View style={styles.bloque}>
            <Text accessibilityRole="header" style={styles.seccion}>
              NOTAS
            </Text>
            <Text style={styles.notas}>{evento.notes}</Text>
          </View>
        ) : null}

        {evento.reminder_minutes !== null ? (
          <View style={styles.bloque}>
            <Text accessibilityRole="header" style={styles.seccion}>
              AVISO
            </Text>
            <Text style={styles.filaTexto}>{textoAviso(evento.reminder_minutes, evento.all_day, evento.start_time)}</Text>
            <Text style={styles.ayuda}>Llegará cuando ito tenga notificaciones.</Text>
          </View>
        ) : null}

        {evento.is_secret && p.otra ? (
          <>
            <BotonSecundario
              etiqueta={`Revelar a ${p.nombrePareja}`}
              onPress={() => {
                setErrorRevelar(null);
                setRevelando(true);
              }}
            />
            <HojaRevelar
              visible={revelando}
              nombrePareja={p.nombrePareja}
              ocupado={ocupado}
              error={errorRevelar}
              onCerrar={() => setRevelando(false)}
              onRevelar={revelar}
            />
          </>
        ) : null}

        <BorrarGasto
          gasto={{ id: evento.id, visible_to_partner: !evento.is_secret }}
          pareja={pareja}
          tipo="event"
          fecha={cumple ? null : fecha}
          fin={cumple ? null : fin}
          repetido={repite && !cumple}
          nombre={cumple ? 'cumpleaños' : undefined}
          parte="pie"
        />
      </ScrollView>
    </View>
  );
}

function Fila({ icono, children }: { icono: ComponentProps<typeof Ionicons>['name']; children: ReactNode }) {
  return (
    <View style={styles.fila}>
      <View style={styles.icono} importantForAccessibility="no" accessibilityElementsHidden>
        <Ionicons name={icono} size={18} color={colors.icon} />
      </View>
      <View style={styles.filaCuerpo}>{children}</View>
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
  contenido: { paddingHorizontal: 20, gap: 14 },
  titulo: { fontFamily: fonts.title, fontSize: 30, lineHeight: 36, color: colors.text },
  tarjeta: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl - 4,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8 },
  icono: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  filaCuerpo: { flex: 1, gap: 1 },
  filaTexto: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.text },
  ayuda: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  categoria: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
  },
  categoriaTexto: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
  quien: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatares: { flexDirection: 'row', alignItems: 'center' },
  solapado: { marginLeft: -8 },
  bloque: {
    gap: 4,
    padding: 16,
    borderRadius: radius.xl - 4,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  seccion: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.textSecondary },
  notas: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text },
});
