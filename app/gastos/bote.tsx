import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { Hoja } from '@/components/gastos/Hoja';
import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { BotonPrincipal, BotonSecundario, EnlaceTexto } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { formatearImporte, leerEuros } from '@/lib/dinero/importe';
import { aportacionRetrasada, boteConPendiente, efectoEnBote, limitesMes, moverMes, nombreMovimiento, proximaAportacion, repartoAportacion, resumenMes } from '@/lib/gastos/bote';
import { infoCategoria } from '@/lib/gastos/categorias';
import { ErrorGasto, aportar, reembolsar } from '@/lib/gastos/consultas';
import { MESES, deISO, fechaCorta, hoyISO } from '@/lib/gastos/fechas';
import { personas } from '@/lib/gastos/personas';
import { otroHueco } from '@/lib/gastos/reparto';
import { useAjustesBote, useInvalidarGastos, useMesBote, useSaldo } from '@/lib/gastos/useGastos';
import { useEstado } from '@/lib/pareja/EstadoProvider';

type Hojas = { tipo: 'aportar' } | { tipo: 'reembolsar'; para: 'yo' | 'pareja' } | null;

/** Bote común (mockup Bote, docs/plan-gastos-fase3.md §2). */
export default function Bote() {
  const colors = useColores();
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pareja } = useEstado();
  const saldo = useSaldo();
  const ajustes = useAjustesBote();
  const invalidar = useInvalidarGastos();
  const [mes, setMes] = useState(() => limitesMes(hoyISO()).desde);
  const { desde, hasta } = limitesMes(mes);
  const delMes = useMesBote(desde, hasta);
  const [hoja, setHoja] = useState<Hojas>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const volver = () => (router.canGoBack() ? router.back() : router.replace('/gastos'));
  const cabecera = (
    <View style={[styles.cabecera, { paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={volver} style={styles.redondo}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.titulo}>
        Bote común
      </Text>
      <View style={styles.hueco} />
    </View>
  );

  if (!pareja || saldo.isLoading || ajustes.isLoading) {
    return (
      <View style={styles.raiz}>
        {cabecera}
        <CargandoHilo size="large" color={colors.accent} style={{ marginTop: 40 }} />
      </View>
    );
  }
  const a = ajustes.data;
  const s = saldo.data;
  // Desactivado con saldo o deudas (revisión M6): se sigue viendo para poder reembolsar, sin aportar.
  const desactivado = !!a && !a.activo;
  if (!a || !s || (desactivado && !boteConPendiente(s))) {
    return (
      <View style={styles.raiz}>
        {cabecera}
        <Text style={styles.vacio}>No tenéis bote común. Podréis activarlo en Ajustes.</Text>
      </View>
    );
  }

  const p = personas(pareja, colors);
  const yo = p.yo.slot;
  const proxima = proximaAportacion(a);
  const retrasada = aportacionRetrasada(a);
  const reparto = a.aportacionCents ? repartoAportacion(a.aportacionCents, a.pctM1) : null;
  const pctYo = yo === 'm1' ? a.pctM1 : 100 - a.pctM1;
  const parteYo = reparto ? (yo === 'm1' ? reparto.m1 : reparto.m2) : 0;
  const partePareja = reparto ? (yo === 'm1' ? reparto.m2 : reparto.m1) : 0;
  const resumen = delMes.data ? resumenMes(delMes.data.movimientos, delMes.data.gastos) : null;
  const maxCategoria = resumen?.categorias[0]?.cents ?? 1;
  const esteMes = mes === limitesMes(hoyISO()).desde;
  const mesNombre = `${MESES[deISO(mes).getMonth()].toLowerCase()}${deISO(mes).getFullYear() !== new Date().getFullYear() ? ` ${deISO(mes).getFullYear()}` : ''}`;

  const alGuardar = (texto: string) => {
    setHoja(null);
    setHecho(texto);
    invalidar();
  };

  return (
    <View style={styles.raiz}>
      {cabecera}
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.tarjeta}>
          <Text style={styles.etiqueta}>SALDO</Text>
          <Text style={styles.saldo}>{formatearImporte(s.pot_balance_cents)}</Text>
          {s.pot_balance_cents < 0 ? (
            <Text style={styles.aviso}>El bote está en negativo: ha pagado más de lo que tenía. Aportad para cuadrarlo.</Text>
          ) : null}
          <Text style={styles.sub}>
            {desactivado
              ? s.pot_balance_cents < 0
                ? 'El bote está desactivado. Aportad lo que falta y reembolsad lo que debe; podéis volver a activarlo en Ajustes.'
                : 'El bote está desactivado. Reembolsad lo que debe; el saldo se queda en el bote por si lo volvéis a activar.'
              : retrasada
              ? `La aportación del ${fechaCorta(retrasada).toLowerCase()} aún no se ha generado.`
              : proxima && a.aportacionCents
                ? `Próxima aportación: ${fechaCorta(proxima).toLowerCase()} · ${formatearImporte(a.aportacionCents)}`
                : 'Se rellena a mano'}
          </Text>
        </View>

        {!desactivado && a.mensual && reparto ? (
          <View style={styles.tarjeta}>
            <Text style={styles.cajaTitulo}>Aportación automática</Text>
            <Text style={styles.sub}>
              {formatearImporte(a.aportacionCents ?? 0)}/mes el día {a.dia}
            </Text>
            <FilaReparto nombre="Tú" color={p.yo.color} avatarPath={p.yo.avatarPath} tinta={p.tintaYo} cents={parteYo} pct={pctYo} />
            <FilaReparto
              nombre={p.nombrePareja}
              color={p.otra?.color ?? null}
              avatarPath={p.otra?.avatarPath}
              tinta={p.tintaPareja}
              cents={partePareja}
              pct={100 - pctYo}
            />
          </View>
        ) : null}

        {/* Desactivado: solo se aporta si está en negativo (si no, no habría forma de cuadrarlo, M6). */}
        {!desactivado || s.pot_balance_cents < 0 ? (
          <BotonPrincipal etiqueta="Aportar ahora" onPress={() => setHoja({ tipo: 'aportar' })} />
        ) : null}

        {hecho ? (
          <View style={styles.hecho} accessibilityLiveRegion="polite">
            <Ionicons name="checkmark" size={20} color={colors.accent} />
            <Text style={styles.hechoTexto}>{hecho}</Text>
          </View>
        ) : null}

        {s.pot_owes_me_cents < 0 ? (
          <Text style={styles.aviso}>
            Te reembolsaste {formatearImporte(-s.pot_owes_me_cents)} de más del bote (un gasto del bote cambió o se borró después). Para
            corregirlo, pide borrar ese reembolso y apunta uno nuevo.
          </Text>
        ) : null}
        {s.pot_owes_partner_cents < 0 ? (
          <Text style={styles.aviso}>
            Se reembolsaron {formatearImporte(-s.pot_owes_partner_cents)} de más a {p.nombrePareja} desde el bote. Para corregirlo, pedid
            borrar ese reembolso y apuntad uno nuevo.
          </Text>
        ) : null}
        {s.pot_owes_me_cents > 0 ? (
          <Deuda
            texto={
              <>
                El bote te debe <Text style={styles.negrita}>{formatearImporte(s.pot_owes_me_cents)}</Text>
              </>
            }
            ayuda="Pagaste con tu dinero gastos que eran del bote."
            onReembolsar={() => setHoja({ tipo: 'reembolsar', para: 'yo' })}
          />
        ) : null}
        {s.pot_owes_partner_cents > 0 ? (
          <Deuda
            texto={
              <>
                El bote debe <Text style={styles.negrita}>{formatearImporte(s.pot_owes_partner_cents)}</Text> a{' '}
                <Text style={[styles.negrita, { color: p.tintaPareja }]}>{p.nombrePareja}</Text>
              </>
            }
            ayuda={`${p.nombrePareja} pagó con su dinero gastos que eran del bote.`}
            onReembolsar={() => setHoja({ tipo: 'reembolsar', para: 'pareja' })}
          />
        ) : null}

        <View style={styles.mesCabecera}>
          <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" onPress={() => setMes(moverMes(mes, -1))} style={styles.flecha}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.etiqueta}>
            MOVIMIENTOS DE {mesNombre.toUpperCase()}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mes siguiente"
            accessibilityState={{ disabled: esteMes }}
            disabled={esteMes}
            onPress={() => setMes(moverMes(mes, 1))}
            style={[styles.flecha, esteMes && { opacity: 0.3 }]}
          >
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </Pressable>
        </View>

        {delMes.isLoading ? (
          <CargandoHilo color={colors.accent} />
        ) : delMes.isError || !resumen || !delMes.data ? (
          <BotonSecundario etiqueta="Reintentar" onPress={() => delMes.refetch()} />
        ) : (
          <View style={styles.lista}>
            {delMes.data.movimientos.length === 0 && resumen.delBote === 0 ? (
              <Text style={styles.sinMovs}>Sin movimientos este mes.</Text>
            ) : null}
            {delMes.data.movimientos.map((m) => {
              const v = efectoEnBote(m);
              return (
                <Pressable
                  key={m.id}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/gastos/movimiento/[id]', params: { id: m.id } })}
                  style={({ pressed }) => [styles.mov, pressed && { opacity: 0.6 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.movTitulo}>{nombreMovimiento(m, yo, p.nombrePareja)}</Text>
                    <Text style={styles.sub}>{fechaCorta(m.occurred_on)}</Text>
                  </View>
                  <Text style={styles.movImporte}>
                    {v >= 0 ? '+' : '−'}
                    {formatearImporte(Math.abs(v))}
                  </Text>
                </Pressable>
              );
            })}
            {resumen.pagado > 0 ? (
              <View style={styles.gastosFila}>
                <Text style={styles.movTitulo}>Gastos pagados desde el bote</Text>
                <Text style={styles.movImporte}>−{formatearImporte(resumen.pagado)}</Text>
              </View>
            ) : null}
            {resumen.delBote > 0 ? (
              <>
                <View style={styles.gastosFila}>
                  <Text style={styles.movTitulo}>Gastos del bote por categoría</Text>
                  <Text style={styles.movImporte}>{formatearImporte(resumen.delBote)}</Text>
                </View>
                {resumen.delBote !== resumen.pagado ? (
                  <Text style={styles.sub}>Incluye lo del bote que pagasteis con tarjeta propia.</Text>
                ) : null}
                {resumen.categorias.map((c) => (
                  <View key={c.categoria} style={styles.cat}>
                    <Text style={styles.catNombre}>{infoCategoria(c.categoria).nombre}</Text>
                    <View style={styles.catBarra}>
                      <View style={[styles.catRelleno, { width: `${Math.round((c.cents / maxCategoria) * 100)}%` }]} />
                    </View>
                    <Text style={styles.catImporte}>{formatearImporte(c.cents)}</Text>
                  </View>
                ))}
              </>
            ) : null}
          </View>
        )}
      </ScrollView>

      {hoja?.tipo === 'aportar' ? (
        <HojaAportar
          onCerrar={() => setHoja(null)}
          onHecho={(texto) => alGuardar(texto)}
          coupleId={pareja.coupleId}
          yo={yo}
          nombrePareja={p.nombrePareja}
          conPareja={!!p.otra}
          pctM1={a.pctM1}
        />
      ) : null}
      {hoja?.tipo === 'reembolsar' ? (
        <HojaReembolsar
          onCerrar={() => setHoja(null)}
          onHecho={(texto) => alGuardar(texto)}
          coupleId={pareja.coupleId}
          hueco={hoja.para === 'yo' ? yo : otroHueco(yo)}
          maximo={hoja.para === 'yo' ? s.pot_owes_me_cents : s.pot_owes_partner_cents}
          saldoBote={s.pot_balance_cents}
          paraQuien={hoja.para === 'yo' ? 'ti' : p.nombrePareja}
        />
      ) : null}
    </View>
  );
}

function FilaReparto(props: {
  nombre: string;
  color: Parameters<typeof AvatarPersona>[0]['color'];
  avatarPath?: string | null;
  tinta: string;
  cents: number;
  pct: number;
}) {
  const colors = useColores();
  const styles = useStyles();
  return (
    <View style={styles.reparto}>
      <AvatarPersona nombre={props.nombre} color={props.color} avatarPath={props.avatarPath} tamano={32} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.negrita, { color: props.tinta }]}>{props.nombre}</Text>
        <View style={styles.barra}>
          <View
            style={[styles.barraRelleno, { width: `${props.pct}%`, backgroundColor: props.color ? colors.personas[props.color].bg : colors.surface }]}
          />
        </View>
      </View>
      <Text style={styles.negrita}>
        {formatearImporte(props.cents)} · {props.pct}{' '}%
      </Text>
    </View>
  );
}

function Deuda({ texto, ayuda, onReembolsar }: { texto: React.ReactNode; ayuda: string; onReembolsar: () => void }) {
  const styles = useStyles();
  return (
    <View style={styles.tarjeta}>
      <Text style={styles.deudaTexto}>{texto}</Text>
      <Text style={styles.sub}>{ayuda}</Text>
      <BotonSecundario etiqueta="Reembolsar desde el bote" onPress={onReembolsar} />
    </View>
  );
}

function HojaAportar({
  onCerrar,
  onHecho,
  coupleId,
  yo,
  nombrePareja,
  conPareja,
  pctM1,
}: {
  onCerrar: () => void;
  onHecho: (texto: string) => void;
  coupleId: string;
  yo: 'm1' | 'm2';
  nombrePareja: string;
  conPareja: boolean;
  /** % de m1 en el bote (ajustes): reparte una aportación de «Los dos». */
  pctM1: number;
}) {
  const styles = useStyles();
  const [quien, setQuien] = useState<'yo' | 'pareja' | 'ambos'>('yo');
  const [importe, setImporte] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Un id por persona: reintentar tras un fallo a medias no duplica la parte que ya entró.
  const [id] = useState(() => Crypto.randomUUID());
  const [idPareja] = useState(() => Crypto.randomUUID());
  const cents = leerEuros(importe);
  // «Los dos»: el importe se reparte con el % del bote, con el mismo redondeo que la aportación automática.
  const partes = cents !== null ? repartoAportacion(cents, pctM1) : null;
  const mia = partes ? (yo === 'm1' ? partes.m1 : partes.m2) : 0;
  const suya = partes ? (yo === 'm1' ? partes.m2 : partes.m1) : 0;
  const pctYo = yo === 'm1' ? pctM1 : 100 - pctM1;

  const confirmar = async () => {
    if (cents === null) {
      setError('Escribe un importe, por ejemplo 300.');
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      if (quien === 'ambos') {
        // Una parte puede ser 0 € (reparto 100/0): esa no se apunta.
        if (mia > 0) await aportar(id, coupleId, yo, mia, hoyISO());
        if (suya > 0) await aportar(idPareja, coupleId, otroHueco(yo), suya, hoyISO());
        onHecho(`Habéis aportado ${formatearImporte(cents)} al bote: tú ${formatearImporte(mia)} y ${nombrePareja} ${formatearImporte(suya)}`);
        return;
      }
      await aportar(id, coupleId, quien === 'yo' ? yo : otroHueco(yo), cents, hoyISO());
      onHecho(quien === 'yo' ? `Has aportado ${formatearImporte(cents)} al bote` : `${nombrePareja} ha aportado ${formatearImporte(cents)} al bote`);
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido guardar. Inténtalo de nuevo.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Hoja visible titulo="Aportar al bote común" onCerrar={onCerrar} bloqueada={ocupado}>
      <Text style={styles.etiqueta}>QUIÉN APORTA</Text>
      <View style={styles.dos} accessibilityRole="radiogroup" accessibilityLabel="Quién aporta">
        {(conPareja ? (['yo', 'pareja', 'ambos'] as const) : (['yo'] as const)).map((q) => (
          <Pressable
            key={q}
            accessibilityRole="radio"
            accessibilityState={{ checked: quien === q }}
            onPress={() => setQuien(q)}
            style={[styles.opcion, quien === q ? styles.opcionActiva : styles.opcionNormal]}
          >
            <Text style={styles.negrita} numberOfLines={1}>
              {q === 'yo' ? 'Tú' : q === 'pareja' ? nombrePareja : 'Los dos'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Campo importe={importe} onCambiar={setImporte} />
      {quien === 'ambos' ? (
        <Text style={styles.sub} accessibilityLiveRegion="polite">
          {partes
            ? `Tú ${formatearImporte(mia)} · ${nombrePareja} ${formatearImporte(suya)} (${pctYo}/${100 - pctYo}, como en vuestros ajustes del bote)`
            : `Se reparte ${pctYo}/${100 - pctYo}, como en vuestros ajustes del bote.`}
        </Text>
      ) : null}
      <MensajeError texto={error} />
      <BotonPrincipal etiqueta="Confirmar aportación" cargando={ocupado} onPress={confirmar} />
      <EnlaceTexto etiqueta="Cancelar" deshabilitado={ocupado} onPress={onCerrar} />
    </Hoja>
  );
}

function HojaReembolsar({
  onCerrar,
  onHecho,
  coupleId,
  hueco,
  maximo,
  paraQuien,
  saldoBote,
}: {
  onCerrar: () => void;
  onHecho: (texto: string) => void;
  coupleId: string;
  hueco: 'm1' | 'm2';
  maximo: number;
  paraQuien: string;
  saldoBote: number;
}) {
  const styles = useStyles();
  const [importe, setImporte] = useState((Math.max(maximo, 0) / 100).toFixed(2).replace('.', ','));
  const [hechoYa, setHechoYa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [id] = useState(() => Crypto.randomUUID());
  const cents = leerEuros(importe);

  const confirmar = async () => {
    if (cents === null) {
      setError('Escribe un importe.');
      return;
    }
    // El máximo es el valor vivo (tiempo real): si alguien acaba de reembolsar, ya no se puede pagar dos veces.
    if (!hechoYa && cents > maximo) {
      setError(maximo <= 0 ? 'El bote ya no debe nada: alguien lo acaba de reembolsar.' : `El bote solo debe ${formatearImporte(maximo)}.`);
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      await reembolsar(id, coupleId, hueco, cents, hoyISO());
      setHechoYa(true);
      onHecho(`Reembolsados ${formatearImporte(cents)} a ${paraQuien} desde el bote`);
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido guardar. Inténtalo de nuevo.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Hoja visible titulo="Reembolsar desde el bote" onCerrar={onCerrar} bloqueada={ocupado}>
      <Text style={styles.sub}>
        Saca el dinero del bote para devolvérselo a {paraQuien}. Puedes reembolsar menos de {formatearImporte(Math.max(maximo, 0))}, nunca más.
      </Text>
      <Campo importe={importe} onCambiar={setImporte} />
      {/* Se permite dejar el bote en negativo (decisión 2 de David): refleja lo que pasa en el banco. */}
      {cents !== null && cents > saldoBote ? (
        <Text style={styles.aviso}>
          El bote solo tiene {formatearImporte(Math.max(saldoBote, 0))}: quedará en negativo ({formatearImporte(saldoBote - cents)}) hasta que
          aportéis.
        </Text>
      ) : null}
      <MensajeError texto={error} />
      <BotonPrincipal etiqueta="Reembolsar" cargando={ocupado} onPress={confirmar} />
      <EnlaceTexto etiqueta="Cancelar" deshabilitado={ocupado} onPress={onCerrar} />
    </Hoja>
  );
}

function Campo({ importe, onCambiar }: { importe: string; onCambiar: (t: string) => void }) {
  const colors = useColores();
  const styles = useStyles();
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.etiqueta}>IMPORTE</Text>
      <View style={styles.campoFila}>
        <TextInput
          accessibilityLabel="Importe en euros"
          value={importe}
          onChangeText={(t) => onCambiar(t.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="0,00"
          placeholderTextColor={colors.inputBorder}
          autoFocus
          style={styles.campo}
        />
        <Text style={styles.euro}>€</Text>
      </View>
    </View>
  );
}

const useStyles = crearEstilos((colors) => ({
  raiz: { flex: 1, backgroundColor: colors.background },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  redondo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hueco: { width: 44 },
  titulo: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  vacio: { margin: 32, textAlign: 'center', fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary },
  contenido: { paddingHorizontal: 20, gap: 12 },
  tarjeta: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl - 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  etiqueta: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.textSecondary },
  saldo: { fontFamily: fonts.title, fontSize: 38, lineHeight: 44, color: colors.text },
  aviso: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.accent },
  sub: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  cajaTitulo: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  negrita: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  reparto: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barra: { height: 8, borderRadius: radius.full, backgroundColor: colors.divider, overflow: 'hidden' },
  barraRelleno: { height: '100%', borderRadius: radius.full },
  hecho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.xl - 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hechoTexto: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  deudaTexto: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  mesCabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  flecha: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  lista: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl - 4, paddingHorizontal: 14, paddingVertical: 4 },
  sinMovs: { paddingVertical: 14, textAlign: 'center', fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
  mov: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.divider },
  movTitulo: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  movImporte: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  gastosFila: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, paddingBottom: 4 },
  cat: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  catNombre: { width: 104, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.icon },
  catBarra: { flex: 1, height: 8, borderRadius: radius.full, backgroundColor: colors.divider, overflow: 'hidden' },
  catRelleno: { height: '100%', borderRadius: radius.full, backgroundColor: colors.icon },
  catImporte: { width: 80, textAlign: 'right', fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  dos: { flexDirection: 'row', gap: 8 },
  opcion: { flex: 1, minHeight: 48, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  opcionNormal: { borderWidth: 1, borderColor: colors.inputBorder, margin: 1 },
  opcionActiva: { borderWidth: 2, borderColor: colors.text },
  campoFila: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  campo: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.background,
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    color: colors.text,
  },
  euro: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.text },
}));
