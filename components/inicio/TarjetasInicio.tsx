import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PinSitio } from '@/components/mapa/PinSitio';
import { Estrellas } from '@/components/mapa/Valoraciones';
import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { colors, fonts, personColors, radius } from '@/constants/theme';
import { type Elemento, textoImporte } from '@/lib/calendario/agrupar';
import { paletaDe } from '@/lib/calendario/colores';
import { rutaDeElemento } from '@/lib/calendario/destino';
import { INFO_CATEGORIA_EVENTO } from '@/lib/calendario/evento';
import { abreviaturaDia, numeroDia } from '@/lib/calendario/rejilla';
import { fechaCorta } from '@/lib/gastos/fechas';
import { personas } from '@/lib/gastos/personas';
import {
  type ClavePaso,
  type Hechos,
  type Movimiento,
  PASOS,
  type PlanMultidia,
  etiquetaPlan,
  haceCuanto,
  lineaMultidia,
  mediaValoracion,
  progresoPasos,
  textoEnDias,
  textoMedia,
  textoPresupuesto,
} from '@/lib/inicio/inicio';
import { INFO_CATEGORIA_SITIO } from '@/lib/mapa/categorias';
import type { Sitio } from '@/lib/mapa/tipos';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

/** Tarjeta granate del próximo plan (mockup Main): cuándo, título y chips; lleva al detalle del evento. */
export function TarjetaProximoPlan({ plan, distancia, hoy, reservado = false }: { plan: Elemento; distancia: string | null; hoy: string; reservado?: boolean }) {
  const router = useRouter();
  const cuando = etiquetaPlan(plan, hoy);
  const chips = [
    distancia ? { icono: 'location-outline' as const, texto: `A ${distancia}` } : null,
    plan.importeCents ? { icono: 'receipt-outline' as const, texto: textoPresupuesto(plan.importeCents) } : null,
    reservado ? { icono: 'checkmark-circle-outline' as const, texto: 'Reservado' } : null,
  ].filter((c) => c !== null);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Próximo plan: ${plan.titulo}, ${cuando.replace(' · ', ' a las ')}${reservado ? ', reservado' : ''}`}
      onPress={() => router.push(rutaDeElemento(plan))}
      style={({ pressed }) => [styles.plan, pressed && { backgroundColor: colors.accentDark }]}
    >
      <Text style={styles.planCuando}>{cuando}</Text>
      <Text style={styles.planTitulo}>{plan.titulo}</Text>
      {chips.length > 0 ? (
        <View style={styles.chips}>
          {chips.map((c) => (
            <View key={c.texto} style={styles.chip}>
              <Ionicons name={c.icono} size={14} color={colors.white} />
              <Text style={styles.chipTexto}>{c.texto}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

/** Bienvenida granate (mockup Inicio-vacio), cuando aún no hay ningún dato. */
export function TarjetaBienvenida({ pareja }: { pareja: Pareja }) {
  const yo = pareja.yo;
  return (
    <View style={styles.bienvenida}>
      <AvatarPersona nombre={yo.nombre} color={yo.color} avatarPath={yo.avatarPath} tamano={46} />
      <View style={styles.bienvenidaTextos}>
        <Text accessibilityRole="header" style={styles.bienvenidaTitulo}>
          Tu espacio está listo
        </Text>
        <Text style={styles.bienvenidaTexto}>
          {pareja.otra
            ? 'Ya estáis los dos. Empezad por lo primero que queráis apuntar.'
            : 'Ya puedes empezar. Cuando tu pareja se una, lo verá todo.'}
        </Text>
      </View>
    </View>
  );
}

/** «Tu pareja aún no se ha unido · El código caduca en 7 días» con «Reenviar invitación» (abre Invitar). */
export function AvisoInvitacion({ titulo, detalle }: { titulo: string; detalle: string | null }) {
  const router = useRouter();
  return (
    <View style={styles.aviso}>
      <View style={styles.avisoFila}>
        <View style={styles.avisoAvatar}>
          <Text style={styles.avisoInicial}>?</Text>
        </View>
        <View style={styles.avisoTextos}>
          <Text style={styles.avisoTitulo}>{titulo}</Text>
          {detalle ? <Text style={styles.avisoDetalle}>{detalle}</Text> : null}
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/pareja/invitar')}
        style={({ pressed }) => [styles.avisoBoton, pressed && { backgroundColor: colors.segmented }]}
      >
        <Text style={styles.avisoBotonTexto}>Reenviar invitación</Text>
      </Pressable>
    </View>
  );
}

const ICONO_PASO: Record<ClavePaso, { icono: keyof typeof Ionicons.glyphMap; fondo: string; tinta: string }> = {
  gasto: { icono: 'wallet-outline', fondo: colors.surface, tinta: colors.icon },
  sitio: { icono: 'location-outline', fondo: colors.surface, tinta: colors.icon },
  evento: { icono: 'calendar-outline', fondo: colors.eventChip, tinta: colors.eventChipText },
  recurrente: { icono: 'repeat-outline', fondo: colors.paymentChip, tinta: colors.paymentChipText },
};

/** «Primeros pasos»: barra de progreso y las cuatro filas, que llevan a los formularios. */
export function PrimerosPasos({ hechos }: { hechos: Hechos }) {
  const router = useRouter();
  const { hechos: n, total } = progresoPasos(hechos);
  const ir = (clave: ClavePaso) => {
    if (clave === 'gasto') router.push('/gastos/nuevo');
    else if (clave === 'sitio') router.push('/mapa/nuevo');
    else if (clave === 'evento') router.push('/calendario/nuevo');
    else router.push('/gastos/recurrente/nuevo');
  };
  return (
    <View style={styles.pasos}>
      <View style={styles.pasosCabecera}>
        <Text accessibilityRole="header" style={styles.pasosTitulo}>
          Primeros pasos
        </Text>
        <Text style={styles.pasosCuenta}>
          {n} de {total}
        </Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Primeros pasos completados"
        accessibilityValue={{ min: 0, max: total, now: n, text: `${n} de ${total}` }}
        style={styles.barra}
      >
        <View style={[styles.barraRelleno, { width: `${(n / total) * 100}%` }]} />
      </View>
      <View style={styles.lista}>
        {PASOS.map((p, i) => {
          const hecho = hechos[p.clave];
          const estilo = ICONO_PASO[p.clave];
          return (
            <Pressable
              key={p.clave}
              accessibilityRole="button"
              accessibilityLabel={`${p.titulo}${hecho ? ', hecho' : ''}. ${p.detalle}`}
              onPress={() => ir(p.clave)}
              style={({ pressed }) => [styles.paso, i < PASOS.length - 1 && styles.pasoSeparado, pressed && { opacity: 0.7 }]}
            >
              <View style={[styles.pasoIcono, { backgroundColor: hecho ? colors.accent : estilo.fondo }]}>
                <Ionicons name={hecho ? 'checkmark' : estilo.icono} size={22} color={hecho ? colors.white : estilo.tinta} />
              </View>
              <View style={styles.pasoTextos}>
                <Text style={[styles.pasoTitulo, hecho && { color: colors.textSecondary }]}>{p.titulo}</Text>
                <Text style={styles.pasoDetalle}>{p.detalle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Título de sección pequeño en versalitas, con enlace opcional a la derecha. */
function TituloSeccion({ titulo, enlace, onEnlace }: { titulo: string; enlace?: string; onEnlace?: () => void }) {
  return (
    <View style={styles.seccionCabecera}>
      <Text accessibilityRole="header" style={styles.seccionTitulo}>
        {titulo}
      </Text>
      {enlace && onEnlace ? (
        <Pressable accessibilityRole="link" onPress={onEnlace} style={styles.seccionEnlace}>
          <Text style={styles.seccionEnlaceTexto}>{enlace}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** «Esta semana»: lo que viene en los próximos 7 días (mockup Main). */
export function EstaSemana({ elementos }: { elementos: Elemento[] }) {
  const router = useRouter();
  if (elementos.length === 0) return null;
  const abrir = (e: Elemento) =>
    e.tipo === 'payment'
      ? router.push({ pathname: '/gastos/recurrente/[id]', params: { id: e.origenId } })
      : router.push(rutaDeElemento(e));
  return (
    <View style={styles.seccion}>
      <TituloSeccion titulo="ESTA SEMANA" enlace="Ver calendario" onEnlace={() => router.push('/calendario')} />
      <View style={styles.listaPanel}>
        {elementos.map((e, i) => {
          const chip =
            e.tipo === 'payment'
              ? { texto: 'Pago', fondo: colors.pagoChip, tinta: colors.pagoChipTexto }
              : e.tipo === 'plan'
                ? { texto: 'Plan', fondo: colors.accentSoft, tinta: colors.accent }
                : e.categoria === 'birthday'
                ? { texto: 'Cumple', fondo: colors.cumpleChip, tinta: colors.cumpleChipTexto }
                : { texto: 'Evento', fondo: colors.eventChip, tinta: colors.eventChipText };
          const linea = e.tipo === 'payment' ? (textoImporte(e) ?? 'Pago') : [e.hora ?? 'Todo el día', e.importeCents ? textoPresupuesto(e.importeCents) : null].filter(Boolean).join(' · ');
          return (
            <Pressable
              key={e.clave}
              accessibilityRole="button"
              accessibilityLabel={`${e.titulo}, ${abreviaturaDia(e.fecha)} ${numeroDia(e.fecha)}. ${linea}. ${chip.texto}`}
              onPress={() => abrir(e)}
              style={({ pressed }) => [styles.filaSemana, i < elementos.length - 1 && styles.separador, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.dia}>
                <Text style={styles.diaSemana}>{abreviaturaDia(e.fecha).toUpperCase()}</Text>
                <Text style={styles.diaNumero}>{numeroDia(e.fecha)}</Text>
              </View>
              <View style={styles.filaTextos}>
                <Text style={styles.filaTitulo} numberOfLines={1}>
                  {e.titulo}
                </Text>
                <Text style={styles.filaLinea} numberOfLines={1}>
                  {linea}
                </Text>
              </View>
              <View style={[styles.etiqueta, { backgroundColor: chip.fondo }]}>
                <Text style={[styles.etiquetaTexto, { color: chip.tinta }]}>{chip.texto}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** «Próximo plan»: la próxima planificación de varios días (viaje, escapada…), en granate suave (mockup Main). */
export function TarjetaMultidia({ plan, hoy }: { plan: PlanMultidia; hoy: string }) {
  const router = useRouter();
  const titulo = `${plan.titulo} · ${textoEnDias(plan.inicio, hoy)}`;
  const linea = lineaMultidia(plan);
  const icono = plan.categoria ? INFO_CATEGORIA_EVENTO[plan.categoria].icono : null;
  const abrir = () =>
    plan.origen === 'plan'
      ? router.push({ pathname: '/planificador/[id]', params: { id: plan.id } })
      : router.push({ pathname: '/calendario/evento/[id]', params: { id: plan.id, fecha: plan.inicio } });
  return (
    <View style={styles.seccion}>
      <TituloSeccion titulo="PRÓXIMO PLAN" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${titulo}. ${linea}`}
        onPress={abrir}
        style={({ pressed }) => [styles.multidia, pressed && { opacity: 0.8 }]}
      >
        <View style={styles.multidiaIcono}>
          {plan.emoji ? (
            <Text style={styles.multidiaEmoji}>{plan.emoji}</Text>
          ) : (
            <Ionicons name={icono ?? 'calendar-outline'} size={24} color={colors.accent} />
          )}
        </View>
        <View style={styles.filaTextos}>
          <Text style={styles.multidiaTitulo}>{titulo}</Text>
          <Text style={styles.multidiaLinea}>{linea}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.accentDark} />
      </Pressable>
    </View>
  );
}

/** «Último lugar visitado»: el sitio de la visita más reciente, con su pin, su categoría y la media de la pareja. */
export function UltimoLugar({ sitio, fecha, emoji }: { sitio: Sitio; fecha: string | null; emoji: string | null }) {
  const router = useRouter();
  const media = mediaValoracion(sitio);
  const categoria = INFO_CATEGORIA_SITIO[sitio.category].etiqueta;
  const cuando = fecha ? fechaCorta(fecha) : 'sin fecha';
  return (
    <View style={styles.seccion}>
      <TituloSeccion titulo="ÚLTIMO LUGAR VISITADO" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${sitio.name}, ${categoria}${media !== null ? `, valoración media ${textoMedia(media)} de 5` : ''}`}
        onPress={() => router.push({ pathname: '/mapa/sitio/[id]', params: { id: sitio.id } })}
        style={({ pressed }) => [styles.lugar, pressed && { opacity: 0.8 }]}
      >
        <PinSitio categoria={sitio.category} estado={sitio.status} privado={!sitio.visible_to_partner} emoji={emoji} tamano={44} />
        <View style={styles.filaTextos}>
          <Text style={styles.filaTitulo} numberOfLines={1}>
            {sitio.name}
          </Text>
          <Text style={styles.filaLinea} numberOfLines={1}>
            {categoria} · {cuando}
          </Text>
        </View>
        {media !== null ? (
          <View style={styles.media} accessible={false}>
            <Estrellas valor={media} tamano={13} />
            <Text style={styles.mediaTexto}>{textoMedia(media)}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const ICONO_MOVIMIENTO: Record<Movimiento['tipo'], keyof typeof Ionicons.glyphMap> = {
  gasto: 'wallet-outline',
  pago: 'swap-horizontal-outline',
  sitio: 'location-outline',
  evento: 'calendar-outline',
};

/** «Últimos movimientos»: actividad reciente de la pareja, con el icono en el color de quien lo hizo. */
export function UltimosMovimientos({ movimientos, pareja }: { movimientos: Movimiento[]; pareja: Pareja }) {
  const router = useRouter();
  if (movimientos.length === 0) return null;
  const p = personas(pareja);
  const abrir = (m: Movimiento) => {
    const id = m.clave.slice(m.clave.indexOf(':') + 1);
    if (m.tipo === 'gasto') router.push({ pathname: '/gastos/[id]', params: { id } });
    else if (m.tipo === 'pago') router.push({ pathname: '/gastos/pago/[id]', params: { id } });
    else if (m.tipo === 'sitio') router.push({ pathname: '/mapa/sitio/[id]', params: { id } });
    else router.push({ pathname: '/calendario/evento/[id]', params: { id } });
  };
  return (
    <View style={styles.seccion}>
      <TituloSeccion titulo="ÚLTIMOS MOVIMIENTOS" enlace="Ver todo" onEnlace={() => router.push('/gastos/historial')} />
      <View style={styles.listaPanel}>
        {movimientos.map((m, i) => {
          const miembro = m.quien === p.yo.userId ? p.yo : m.quien === p.otra?.userId ? p.otra : null;
          const paleta = paletaDe(miembro?.color);
          const cuando = haceCuanto(m.cuando);
          return (
            <Pressable
              key={m.clave}
              accessibilityRole="button"
              accessibilityLabel={`${m.texto}, ${cuando}`}
              onPress={() => abrir(m)}
              style={({ pressed }) => [styles.filaSemana, i < movimientos.length - 1 && styles.separador, pressed && { opacity: 0.7 }]}
            >
              <View style={[styles.movIcono, { backgroundColor: paleta.relleno }]}>
                <Ionicons name={ICONO_MOVIMIENTO[m.tipo]} size={18} color={paleta.borde} />
              </View>
              <View style={styles.filaTextos}>
                <Text style={styles.movTexto} numberOfLines={2}>
                  {m.texto}
                </Text>
                <Text style={styles.filaLinea}>{cuando}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  seccion: { gap: 8 },
  seccionCabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seccionTitulo: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.textSecondary },
  seccionEnlace: { minHeight: 44, justifyContent: 'center' },
  seccionEnlaceTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.accent },
  listaPanel: { paddingHorizontal: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 20 },
  filaSemana: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 6 },
  separador: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  dia: { width: 44, alignItems: 'center' },
  diaSemana: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textSecondary },
  diaNumero: { fontFamily: fonts.bodyBold, fontSize: 19, color: colors.text },
  filaTextos: { flex: 1, minWidth: 0, gap: 2 },
  filaTitulo: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  filaLinea: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  etiqueta: { borderRadius: radius.full, paddingVertical: 4, paddingHorizontal: 10 },
  etiquetaTexto: { fontFamily: fonts.bodyBold, fontSize: 12 },
  multidia: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.accentSoft, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16 },
  multidiaIcono: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  multidiaEmoji: { fontSize: 24 },
  multidiaTitulo: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  multidiaLinea: { fontFamily: fonts.body, fontSize: 13, color: colors.accentDark },
  lugar: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16 },
  media: { alignItems: 'flex-end', gap: 2 },
  mediaTexto: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textSecondary },
  movIcono: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  movTexto: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 19, color: colors.text },
  plan: { backgroundColor: colors.accent, borderRadius: radius.xl, padding: 18, gap: 10 },
  planCuando: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.white },
  planTitulo: { fontFamily: fonts.title, fontSize: 23, lineHeight: 29, color: colors.white },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accentDark, borderRadius: radius.full, paddingVertical: 6, paddingHorizontal: 11 },
  chipTexto: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.white },

  bienvenida: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.accent, borderRadius: radius.xl, paddingVertical: 20, paddingHorizontal: 18 },
  bienvenidaTextos: { flex: 1, gap: 3 },
  bienvenidaTitulo: { fontFamily: fonts.title, fontSize: 23, lineHeight: 29, color: colors.white },
  bienvenidaTexto: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.white },

  aviso: { gap: 12, padding: 16, borderRadius: 20, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  avisoFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avisoAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: personColors.lavanda.bg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avisoInicial: { fontFamily: fonts.bodyBold, fontSize: 16, color: personColors.lavanda.ink },
  avisoTextos: { flex: 1, gap: 2 },
  avisoTitulo: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  avisoDetalle: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  avisoBoton: { minHeight: 44, borderRadius: radius.full, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  avisoBotonTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },

  pasos: { gap: 6 },
  pasosCabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  pasosTitulo: { fontFamily: fonts.title, fontSize: 20, color: colors.text },
  pasosCuenta: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textSecondary },
  barra: { height: 6, borderRadius: radius.full, backgroundColor: colors.border, marginBottom: 6, overflow: 'hidden' },
  barraRelleno: { height: 6, borderRadius: radius.full, backgroundColor: colors.accent },
  lista: { paddingVertical: 4, paddingHorizontal: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 20 },
  paso: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 11, minHeight: 44 },
  pasoSeparado: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  pasoIcono: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pasoTextos: { flex: 1, gap: 2 },
  pasoTitulo: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  pasoDetalle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
});
