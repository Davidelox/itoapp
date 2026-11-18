import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarraPorcentaje, Chip, FilaChips, Grupo, Interruptor } from '@/components/gastos/Controles';
import { SelectorFecha } from '@/components/gastos/SelectorFecha';
import { BotonNudo } from '@/components/hilo/BotonNudo';
import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { Segmentado } from '@/components/onboarding/OpcionRadio';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, personColors, radius } from '@/constants/theme';
import { type Origen, destinoTrasGuardarPago } from '@/lib/calendario/destino';
import { formatearImporte, leerEuros } from '@/lib/dinero/importe';
import { CATEGORIAS, type Categoria, INFO_CATEGORIA } from '@/lib/gastos/categorias';
import { type AjustesGastos, soloCambios } from '@/lib/gastos/consultas';
import { type DatosRecurrente, crearRecurrente, editarRecurrente } from '@/lib/gastos/consultasRecurrentes';
import { ErrorGasto } from '@/lib/gastos/error';
import { aISO, deISO, hoyISO } from '@/lib/gastos/fechas';
import { personas } from '@/lib/gastos/personas';
import { type Frecuencia, type Recurrente, esPersonal, fechaCobro, proximoCobro, textoFrecuencia } from '@/lib/gastos/recurrentes';
import {
  type Pagador,
  type Reparto,
  aDatos,
  deDatos,
  fraseResultado,
  partes,
  partesDeYo,
  pctDeYo,
  puedeSerPrivado,
  ocultaProporcional,
  sinProporcionalOculto,
  valoresPorDefecto,
} from '@/lib/gastos/reparto';
import { useInvalidarGastos } from '@/lib/gastos/useGastos';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

const PAUSA_NUDO_MS = 900;
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sept', 'Oct', 'Nov', 'Dic'];
const AVISOS: { valor: number | null; etiqueta: string }[] = [
  { valor: null, etiqueta: 'Sin aviso' },
  { valor: 0, etiqueta: 'El mismo día' },
  { valor: 1, etiqueta: '1 día antes' },
  { valor: 3, etiqueta: '3 días antes' },
];

const importeATexto = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

type Props = {
  pareja: Pareja;
  ajustes: AjustesGastos;
  /** Con un recurrente, el formulario edita; sin él, crea uno nuevo. */
  inicial?: Recurrente;
  /** Se muestra al final del formulario (al editar: cobros, pausar y borrar). */
  extra?: ReactNode;
  alGuardarEdicion?: (enCurso: boolean) => void;
  /** Al crear desde la pestaña Personales, empieza como pago personal. */
  personalInicial?: boolean;
  /** Al crear desde «Crear pago» del Calendario (`YYYY-MM-DD`): el día de cobro, el mes (anual) y la fecha (una vez) de partida. */
  diaInicial?: string;
  /** Al crear: desde dónde se abrió. Del calendario se vuelve a él (en el día del primer cobro); de Gastos, a la lista de pagos. */
  origen?: Origen;
};

/** Nuevo o editar pago recurrente (mockup NuevoPago, docs/plan-gastos-fase4.md §2). */
export function FormularioRecurrente({ pareja, ajustes, inicial, extra, alGuardarEdicion, personalInicial = false, diaInicial, origen = 'gastos' }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const invalidar = useInvalidarGastos();
  const p = personas(pareja);
  const yo = p.yo.slot;
  const editando = !!inicial;
  const hoy = hoyISO();

  const desdeDatos = inicial ? deDatos(yo, inicial) : null;
  const pctProporcionalM1 =
    inicial?.split_mode === 'proportional' && inicial.split_pct_m1 !== null ? inicial.split_pct_m1 : ajustes.pctProporcionalM1;
  const sinProporcional = ocultaProporcional(pctProporcionalM1, inicial?.split_mode === 'proportional');
  const porDefectoDe = (c: Categoria) => {
    const d = valoresPorDefecto(ajustes, c);
    return { ...d, reparto: sinProporcionalOculto(d.reparto, sinProporcional) };
  };
  const porDefecto = porDefectoDe(inicial?.category ?? 'subscriptions');

  const [nombre, setNombre] = useState(inicial?.name ?? '');
  const [importe, setImporte] = useState(inicial ? importeATexto(inicial.amount_cents) : '');
  const [variable, setVariable] = useState(inicial?.is_variable ?? false);
  const [categoria, setCategoria] = useState<Categoria>(inicial?.category ?? 'subscriptions');
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(inicial?.frequency ?? 'monthly');
  // Fecha de partida: la que llega de «Crear pago» (si es una fecha de verdad) o hoy; un cobro único no puede ser pasado.
  const partida = diaInicial && aISO(deISO(diaInicial)) === diaInicial ? diaInicial : hoy;
  const [dia, setDia] = useState(inicial?.day_of_month ?? deISO(partida).getDate());
  const [mes, setMes] = useState(inicial?.month_of_year ?? deISO(partida).getMonth() + 1);
  const [fecha, setFecha] = useState(inicial?.frequency === 'once' ? inicial.start_date : partida < hoy ? hoy : partida);
  // Personal: lo paga una persona y es solo suyo (sin «¿Quién paga?» ni «¿De quién es?»).
  const [personal, setPersonal] = useState(inicial ? esPersonal(inicial) : personalInicial);
  const [pagador, setPagador] = useState<Pagador>(
    desdeDatos && !(inicial && esPersonal(inicial)) ? desdeDatos.pagador : personalInicial ? 'yo' : porDefecto.pagador,
  );
  const [reparto, setReparto] = useState<Reparto>(
    desdeDatos && !(inicial && esPersonal(inicial)) ? desdeDatos.reparto : personalInicial ? 'medias' : porDefecto.reparto,
  );
  const [repartoTocado, setRepartoTocado] = useState(editando);
  const [pctYo, setPctYo] = useState(desdeDatos?.reparto === 'personalizado' ? desdeDatos.pctYo : 50);
  const [visible, setVisible] = useState(inicial ? inicial.visible_to_partner : ajustes.compartirRecurrentes);
  const [aviso, setAviso] = useState<number | null>(inicial ? inicial.reminder_days : 1);
  const [calendario, setCalendario] = useState(inicial?.show_in_calendar ?? true);
  const [error, setError] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [idNuevo] = useState(() => Crypto.randomUUID());

  const conBote = ajustes.boteActivo || desdeDatos?.pagador === 'bote' || desdeDatos?.reparto === 'bote';
  const soyQuienLoCreo = !inicial || inicial.created_by === p.yo.userId;

  // Pagado por el bote: siempre del bote (como en el mockup, sin «¿De quién es?»). En compartido no cabe
  // «lo pago yo y es solo mío» (eso es personal): pasa a medias.
  let repartoCompartido: Reparto = pagador === 'bote' ? 'bote' : reparto === 'bote' && !conBote ? 'medias' : reparto;
  if ((pagador === 'yo' && repartoCompartido === 'solo_yo') || (pagador === 'pareja' && repartoCompartido === 'solo_pareja')) {
    repartoCompartido = 'medias';
  }
  // Un personal de la pareja (visible) sigue siendo suyo al editarlo.
  const duenoEsPareja = !!inicial && esPersonal(inicial) && inicial.paid_by !== yo;
  const pagadorFinal: Pagador = personal ? (duenoEsPareja ? 'pareja' : 'yo') : pagador;
  const repartoFinal: Reparto = personal ? (duenoEsPareja ? 'solo_pareja' : 'solo_yo') : repartoCompartido;
  const cents = leerEuros(importe);
  const nombreLimpio = nombre.trim();
  const reparteDatos = aDatos(yo, pagadorFinal, repartoFinal, pctYo, pctProporcionalM1);
  const vista = partes(cents ?? 0, reparteDatos.split_mode, reparteDatos.split_pct_m1);
  const mias = partesDeYo(yo, vista);
  const frase = fraseResultado(yo, reparteDatos.paid_by, vista, p.nombrePareja, 'futuro');
  const cada = frecuencia === 'monthly' ? ' cada mes' : frecuencia === 'yearly' ? ' cada año' : '';
  const resultado =
    frase.quien === 'pareja'
      ? `${frase.texto}${cada}${variable ? ' (aprox.)' : ''}`
      : frase.texto.replace('Gasto solo', 'Pago solo').replace('Sale del bote común.', `Sale del bote común${cada}.`);
  const privadoPosible = puedeSerPrivado(pagadorFinal, repartoFinal);
  const visibleFinal = privadoPosible ? visible : true;

  const startDate = frecuencia === 'once' ? fecha : inicial && inicial.frequency !== 'once' ? inicial.start_date : hoy;
  const datos: DatosRecurrente = {
    name: nombreLimpio,
    category: categoria,
    amount_cents: cents ?? 0,
    is_variable: variable,
    frequency: frecuencia,
    day_of_month: frecuencia === 'once' ? null : dia,
    month_of_year: frecuencia === 'yearly' ? mes : null,
    start_date: startDate,
    end_date: inicial?.end_date ?? null,
    ...reparteDatos,
    reminder_days: aviso,
    visible_to_partner: visibleFinal,
    show_in_calendar: calendario,
  };
  // Al editar sin cambiar la frecuencia cuenta lo ya cobrado (uno por periodo); si cambia, el servidor empieza de cero.
  const mismaFrecuencia = inicial && inicial.frequency === frecuencia;
  const primero = proximoCobro(
    { ...datos, paused: false, ...(mismaFrecuencia ? { active_from: inicial.active_from, ultimo_cobro: inicial.ultimo_cobro } : {}) },
    hoy,
  );

  // Un puntual ya pasado se puede seguir editando (nombre, aviso…) mientras no se le cambie la fecha.
  const fechaSinCambiar = inicial?.frequency === 'once' && fecha === inicial.start_date;
  const errores = {
    nombre: intentado && nombreLimpio === '' ? 'Escribe el nombre del pago, por ejemplo Netflix.' : null,
    importe: intentado && cents === null ? 'Escribe un importe, por ejemplo 12,99.' : null,
    fecha:
      frecuencia === 'once' && fecha < hoy && !fechaSinCambiar ? 'Elige hoy o un día futuro. Para algo ya pagado, apunta un gasto.' : null,
  };
  const completo = nombreLimpio !== '' && cents !== null && !errores.fecha;

  const elegirCategoria = (c: Categoria) => {
    setCategoria(c);
    if (!repartoTocado) {
      const d = porDefectoDe(c);
      setPagador(d.pagador);
      setReparto(d.reparto);
    }
  };

  const guardar = async () => {
    setIntentado(true);
    if (!completo) throw new Error('incompleto');
    setError(null);
    try {
      if (inicial) {
        const base = { ...datos, ...(soyQuienLoCreo ? {} : { visible_to_partner: inicial.visible_to_partner }) };
        const cambios = soloCambios(inicial, base);
        if (Object.keys(cambios).length > 0) {
          alGuardarEdicion?.(true);
          await editarRecurrente(inicial.id, inicial.version, cambios, p.nombrePareja);
        }
      } else {
        await crearRecurrente(idNuevo, pareja.coupleId, datos);
      }
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido guardar. Inténtalo de nuevo.');
      alGuardarEdicion?.(false);
      throw e;
    }
  };

  const alTerminar = () => {
    invalidar();
    setTimeout(() => {
      if (editando) return router.canGoBack() ? router.back() : router.replace('/gastos/recurrentes');
      // Un pago nuevo vuelve a donde se creó. `dismissTo` cierra el formulario (y el del evento, si se vino de
      // «Crear pago» del calendario) sin dejarlo en el historial ni apilar otra pantalla igual.
      const d = destinoTrasGuardarPago(origen, idNuevo, primero);
      if (d.destino === 'calendario') router.dismissTo({ pathname: '/calendario', params: d.params });
      else router.dismissTo('/gastos/recurrentes');
    }, PAUSA_NUDO_MS);
  };

  const pagadores = [
    ...(conBote ? [{ valor: 'bote' as const, etiqueta: 'Bote común', miembro: null, tinta: colors.text }] : []),
    { valor: 'yo' as const, etiqueta: 'Tú', miembro: p.yo, tinta: p.tintaYo },
    { valor: 'pareja' as const, etiqueta: p.nombrePareja, miembro: p.otra, tinta: p.tintaPareja },
  ];
  const pctProporcionalYo = pctDeYo(yo, pctProporcionalM1);
  const opcionesReparto: { valor: Reparto; etiqueta: string }[] = [
    { valor: 'medias', etiqueta: 'A medias' },
    ...(sinProporcional
      ? []
      : [{ valor: 'proporcional' as const, etiqueta: `Proporcional ${pctProporcionalYo}/${100 - pctProporcionalYo}` }]),
    { valor: 'personalizado', etiqueta: 'Personalizado' },
    // Pagas tú y es de tu pareja (o al revés): genera deuda, así que es compartido.
    ...(pagador === 'pareja' ? [{ valor: 'solo_yo' as const, etiqueta: 'Solo tú' }] : []),
    ...(pagador === 'yo' ? [{ valor: 'solo_pareja' as const, etiqueta: `Solo ${p.nombrePareja}` }] : []),
  ];

  return (
    <KeyboardAvoidingView style={styles.raiz} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.cabecera, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={() => router.back()} style={styles.cerrar}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.titulo}>
          {editando ? 'Pago recurrente' : 'Nuevo pago recurrente'}
        </Text>
        <View style={styles.cerrarHueco} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.contenido}>
        <Grupo etiqueta="Nombre">
          <TextInput
            accessibilityLabel="Nombre"
            value={nombre}
            onChangeText={setNombre}
            maxLength={80}
            placeholder="Netflix, luz, alquiler…"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="sentences"
            style={styles.campo}
          />
          <MensajeError texto={errores.nombre} />
        </Grupo>

        <Grupo etiqueta="Importe">
          <Segmentado
            etiqueta="Tipo de importe"
            opciones={[
              { valor: 'fijo', etiqueta: 'Importe fijo' },
              { valor: 'variable', etiqueta: 'Importe variable' },
            ]}
            valor={variable ? 'variable' : 'fijo'}
            onCambiar={(v) => setVariable(v === 'variable')}
          />
          <View style={styles.importeFila}>
            <TextInput
              accessibilityLabel={variable ? 'Importe aproximado en euros' : 'Importe en euros'}
              value={importe}
              onChangeText={(t) => setImporte(t.replace(/[^0-9.,]/g, ''))}
              placeholder="0,00"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              inputMode="decimal"
              style={[styles.campo, styles.importe]}
            />
            <Text style={styles.euro}>€</Text>
          </View>
          <Text style={styles.ayuda}>
            {variable ? 'Aproximado. Cuando llegue la factura te pediremos el importe real.' : 'Se apunta solo, siempre el mismo importe.'}
          </Text>
          <MensajeError texto={errores.importe} />
        </Grupo>

        <Grupo etiqueta="Categoría" rol="radiogroup">
          <FilaChips>
            {CATEGORIAS.map((c) => (
              <Chip key={c} rol="radio" etiqueta={INFO_CATEGORIA[c].nombre} activo={categoria === c} onPress={() => elegirCategoria(c)} />
            ))}
          </FilaChips>
        </Grupo>

        <Grupo etiqueta="Frecuencia">
          <Segmentado
            etiqueta="Frecuencia"
            opciones={[
              { valor: 'once', etiqueta: 'Una vez' },
              { valor: 'monthly', etiqueta: 'Cada mes' },
              { valor: 'yearly', etiqueta: 'Cada año' },
            ]}
            valor={frecuencia}
            onCambiar={(v) => setFrecuencia(v as Frecuencia)}
          />
        </Grupo>

        {frecuencia === 'once' ? (
          <Grupo etiqueta="Fecha del cobro" rol="radiogroup">
            <SelectorFecha valor={fecha} onCambiar={setFecha} />
            <MensajeError texto={errores.fecha} />
          </Grupo>
        ) : (
          <>
            <View style={styles.tarjeta}>
              <View style={styles.flex}>
                <Text style={styles.tarjetaTitulo}>Día de cobro</Text>
                <Text style={styles.ayuda}>{textoFrecuencia(frecuencia, dia, mes, fecha)}</Text>
              </View>
              <BotonRedondo icono="remove" etiqueta="Un día antes" onPress={() => setDia(Math.max(1, dia - 1))} />
              <Text style={styles.dia} accessibilityLiveRegion="polite">
                {dia}
              </Text>
              <BotonRedondo icono="add" etiqueta="Un día después" onPress={() => setDia(Math.min(31, dia + 1))} />
            </View>
            {frecuencia === 'yearly' ? (
              <Grupo etiqueta="Mes" rol="radiogroup">
                <FilaChips>
                  {MESES_CORTOS.map((m, i) => (
                    <Chip key={m} rol="radio" etiqueta={m} activo={mes === i + 1} onPress={() => setMes(i + 1)} />
                  ))}
                </FilaChips>
              </Grupo>
            ) : null}
          </>
        )}
        {primero && !errores.fecha ? (
          <Text style={styles.ayuda}>
            {editando ? 'Próximo cobro' : 'Primer cobro'}: {fechaCobro(primero)}
            {primero === hoy ? ' (hoy)' : ''}
          </Text>
        ) : null}

        <Grupo etiqueta="Tipo de pago">
          <Segmentado
            etiqueta="Tipo de pago"
            opciones={[
              { valor: 'compartido', etiqueta: 'Compartido' },
              { valor: 'personal', etiqueta: 'Personal' },
            ]}
            valor={personal ? 'personal' : 'compartido'}
            onCambiar={(v) => setPersonal(v === 'personal')}
          />
          <Text style={styles.ayuda}>
            {personal
              ? duenoEsPareja
                ? `Lo paga ${p.nombrePareja} y es solo suyo: no genera deudas.`
                : 'Lo pagas tú y es solo tuyo: no genera deudas.'
              : 'Entre los dos o desde el bote.'}
          </Text>
        </Grupo>

        {!personal ? (
          <Grupo etiqueta="¿Quién paga?" rol="radiogroup">
            <View style={styles.pagadores}>
              {pagadores.map((o) => {
                const activo = pagador === o.valor;
                return (
                  <Pressable
                    key={o.valor}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: activo }}
                    accessibilityLabel={o.etiqueta}
                    onPress={() => {
                      setPagador(o.valor);
                      setRepartoTocado(true);
                      if (o.valor !== 'bote' && reparto === 'bote') setReparto('medias');
                    }}
                    style={[styles.pagador, activo ? styles.pagadorActivo : styles.pagadorNormal]}
                  >
                    {o.valor === 'bote' ? (
                      <View style={styles.boteIcono}>
                        <Ionicons name="server-outline" size={16} color={colors.icon} />
                      </View>
                    ) : (
                      <AvatarPersona
                        nombre={o.valor === 'yo' ? p.yo.nombre : p.nombrePareja}
                        color={o.miembro?.color ?? null}
                        avatarPath={o.miembro?.avatarPath}
                        tamano={28}
                      />
                    )}
                    <Text style={[styles.pagadorTexto, { color: o.tinta }]} numberOfLines={1}>
                      {o.etiqueta}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Grupo>
        ) : null}

        {!personal && pagador !== 'bote' ? (
          <Grupo etiqueta="¿De quién es?" rol="radiogroup">
            <FilaChips>
              {opcionesReparto.map((o) => (
                <Chip
                  key={o.valor}
                  rol="radio"
                  etiqueta={o.etiqueta}
                  activo={repartoFinal === o.valor}
                  onPress={() => {
                    setReparto(o.valor);
                    setRepartoTocado(true);
                  }}
                />
              ))}
            </FilaChips>
          </Grupo>
        ) : null}

        {repartoFinal === 'personalizado' ? (
          <BarraPorcentaje
            pctYo={pctYo}
            onCambiar={setPctYo}
            nombrePareja={p.nombrePareja}
            importeYo={cents !== null ? formatearImporte(mias.yo) : null}
            importePareja={cents !== null ? formatearImporte(mias.pareja) : null}
            tintaYo={p.tintaYo}
            tintaPareja={p.tintaPareja}
            fondoYo={p.yo.color ? personColors[p.yo.color].bg : colors.surface}
            fondoPareja={p.otra?.color ? personColors[p.otra.color].bg : colors.divider}
          />
        ) : null}

        {!personal ? (
          <Text style={styles.resultado} accessibilityLiveRegion="polite">
            {resultado}
          </Text>
        ) : null}

        {privadoPosible && soyQuienLoCreo ? (
          <Interruptor
            titulo={`Visible para ${p.nombrePareja}`}
            ayuda={visible ? `${p.nombrePareja} verá este pago` : 'Solo lo verás tú'}
            valor={visible}
            onCambiar={setVisible}
          />
        ) : null}

        <Grupo etiqueta="Aviso" rol="radiogroup">
          <FilaChips>
            {AVISOS.map((a) => (
              <Chip key={a.etiqueta} rol="radio" etiqueta={a.etiqueta} activo={aviso === a.valor} onPress={() => setAviso(a.valor)} />
            ))}
          </FilaChips>
          <Text style={styles.ayuda}>Los avisos llegarán cuando ito tenga notificaciones.</Text>
        </Grupo>

        <Interruptor titulo="Mostrar en el calendario" ayuda="Cada cobro sale como Pago" valor={calendario} onCambiar={setCalendario} />

        <MensajeError texto={error} />
        {extra}
      </ScrollView>

      <View style={[styles.pie, { paddingBottom: insets.bottom + 16 }]}>
        <BotonNudo
          label={editando ? 'Guardar cambios' : 'Guardar pago'}
          labelHecho="Guardado"
          labelError="No se ha podido guardar"
          onPress={guardar}
          onHecho={alTerminar}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function BotonRedondo({ icono, etiqueta, onPress }: { icono: 'add' | 'remove'; etiqueta: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      onPress={onPress}
      style={({ pressed }) => [styles.redondo, pressed && { backgroundColor: colors.surface }]}
    >
      <Ionicons name={icono} size={22} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colors.background },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  cerrar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cerrarHueco: { width: 44 },
  titulo: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  contenido: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, gap: 14 },
  campo: {
    height: 50,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.white,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
  },
  importeFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  importe: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 18 },
  euro: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text },
  ayuda: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  flex: { flex: 1, gap: 1 },
  tarjeta: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingLeft: 16,
    paddingRight: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tarjetaTitulo: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  dia: { minWidth: 28, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text },
  redondo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagadores: { flexDirection: 'row', gap: 8 },
  pagador: {
    flex: 1,
    minWidth: 0,
    minHeight: 68,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  pagadorNormal: { borderWidth: 1, borderColor: colors.inputBorder, margin: 1 },
  pagadorActivo: { borderWidth: 2, borderColor: colors.text },
  pagadorTexto: { fontFamily: fonts.bodyBold, fontSize: 13 },
  boteIcono: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  resultado: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  pie: { backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 20, paddingTop: 12 },
});
