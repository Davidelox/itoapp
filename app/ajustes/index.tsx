import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HojaPermisoAvisos } from '@/components/avisos/HojaPermisoAvisos';
import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { HojaBorrarCuenta, HojaContrasena, HojaPerfil, HojaSalir } from '@/components/ajustes/HojasCuenta';
import { HojaBote, HojaCategorias, HojaReparto } from '@/components/ajustes/HojasDinero';
import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { fonts, radius } from '@/constants/theme';
import { Chip } from '@/components/gastos/Controles';
import { crearEstilos, guardarTema, type PreferenciaTema, preferenciaActual, useColores } from '@/lib/tema';
import { listaCategorias, resumenBote, resumenReparto, textoPorcentaje, textosCambios } from '@/lib/ajustes/ajustes';
import { guardarPresupuestos, usePresupuestos } from '@/lib/ajustes/presupuestos';
import { type CampoPrivacidad, guardarPrivacidad, responderPropuesta, retirarPropuesta } from '@/lib/ajustes/consultas';
import { cerrarSesion } from '@/lib/auth/acciones';
import { enExpoGo, puedeRecibirPush } from '@/lib/avisos/entorno';
import { AVISOS, AVISO_EXPO_GO, type CampoAviso, type EstadoPermiso, textoEstadoPermiso } from '@/lib/avisos/estado';
import { type Intento, textoIntento } from '@/lib/avisos/plazo';
import { alCambiarIntento, estadoPermiso, probarAviso, registrarDispositivo, ultimoIntento } from '@/lib/avisos/registro';
import { formatearImporte } from '@/lib/dinero/importe';
import { ErrorGasto } from '@/lib/gastos/error';
import { MESES } from '@/lib/gastos/fechas';
import { personas } from '@/lib/gastos/personas';
import { useDatosAjustes, useInvalidarGastos, useSaldo } from '@/lib/gastos/useGastos';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { supabase } from '@/lib/supabase';

type HojaAbierta = 'perfil' | 'reparto' | 'categorias' | 'bote' | 'contrasena' | 'salir' | 'borrar' | 'avisos' | null;

/** Ajustes (docs/plan-ajustes.md): perfil, pareja, dinero, privacidad y cuenta. Cada cambio, en una hoja. */
export default function Ajustes() {
  const colors = useColores();
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const presupuestos = usePresupuestos();
  const { pareja, userId } = useEstado();
  const datos = useDatosAjustes();
  const saldo = useSaldo();
  const invalidar = useInvalidarGastos();
  const [abierta, setAbierta] = useState<HojaAbierta>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [compartir, setCompartir] = useState<Partial<Record<CampoPrivacidad, boolean>>>({});
  const [errorPrivacidad, setErrorPrivacidad] = useState<string | null>(null);
  const [avisosLocal, setAvisosLocal] = useState<Partial<Record<CampoAviso, boolean>>>({});
  const [errorAvisos, setErrorAvisos] = useState<string | null>(null);
  const [permiso, setPermiso] = useState<EstadoPermiso | null>(null);
  const [prueba, setPrueba] = useState<{ ocupado: boolean; texto: string | null }>({ ocupado: false, texto: null });

  const { refetch } = datos;
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );
  useEffect(() => {
    estadoPermiso().then(setPermiso);
  }, [abierta]);
  const [tema, setTema] = useState<PreferenciaTema>(preferenciaActual);
  const [intento, setIntento] = useState<Intento | null>(null);
  const [reintentando, setReintentando] = useState(false);
  useEffect(() => {
    const leer = () => void ultimoIntento().then(setIntento);
    leer();
    return alCambiarIntento(leer);
  }, []);
  const reintentar = async () => {
    setReintentando(true);
    try {
      await registrarDispositivo();
    } finally {
      setReintentando(false);
    }
  };
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
  }, []);

  const volver = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const cerrar = () => setAbierta(null);

  if (!pareja || !userId) return null;
  const p = personas(pareja, colors);
  const d = datos.data;
  const fila = d?.fila;
  const valorPrivacidad = (campo: CampoPrivacidad) =>
    compartir[campo] ?? (campo === 'share_personal_expenses' ? d?.compartirPersonales : d?.compartirRecurrentes) ?? false;
  const version = Constants.expoConfig?.version;

  const cambiarPrivacidad = async (campo: CampoPrivacidad, v: boolean) => {
    setCompartir((c) => ({ ...c, [campo]: v }));
    setErrorPrivacidad(null);
    try {
      await guardarPrivacidad(userId, campo, v);
      invalidar();
    } catch (e) {
      setCompartir((c) => ({ ...c, [campo]: !v }));
      setErrorPrivacidad(e instanceof ErrorGasto ? e.message : 'No se ha podido guardar.');
    }
  };

  const cambiarAviso = async (campo: CampoAviso, v: boolean) => {
    setAvisosLocal((c) => ({ ...c, [campo]: v }));
    setErrorAvisos(null);
    try {
      await guardarPrivacidad(userId, campo, v);
    } catch (e) {
      setAvisosLocal((c) => ({ ...c, [campo]: !v }));
      setErrorAvisos(e instanceof ErrorGasto ? e.message : 'No se ha podido guardar.');
    }
  };
  const probar = async () => {
    setPrueba({ ocupado: true, texto: null });
    try {
      const enviado = await probarAviso();
      setPrueba({ ocupado: false, texto: enviado ? 'Enviado. Llegará en un par de minutos.' : 'Ya has enviado uno hace un momento.' });
    } catch {
      setPrueba({ ocupado: false, texto: 'No se ha podido enviar. Inténtalo de nuevo.' });
    }
  };
  const puedePush = puedeRecibirPush();

  return (
    <View style={styles.raiz}>
      <View style={[styles.cabecera, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={volver} style={styles.redondo}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.titulo}>
          Ajustes
        </Text>
        <View style={styles.hueco} />
      </View>

      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 32 }]}>
        {/* Perfil */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Editar tu perfil"
          onPress={() => setAbierta('perfil')}
          style={({ pressed }) => [styles.perfil, pressed && styles.pulsado]}
        >
          <AvatarPersona nombre={p.yo.nombre} color={p.yo.color} avatarPath={p.yo.avatarPath} tamano={64} />
          <View style={styles.perfilTextos}>
            <Text style={styles.perfilNombre}>{p.yo.nombre.trim() || 'Sin nombre'}</Text>
            {p.yo.color ? (
              <Text style={[styles.perfilColor, { color: colors.personas[p.yo.color].ink }]}>{colors.personas[p.yo.color].nombre}</Text>
            ) : null}
          </View>
          <Text style={styles.editar}>Editar</Text>
        </Pressable>

        {/* Pareja */}
        <Seccion titulo="PAREJA">
          {p.otra ? (
            <View style={styles.pareja}>
              <View style={styles.avatares}>
                <AvatarPersona nombre={p.yo.nombre} color={p.yo.color} avatarPath={p.yo.avatarPath} tamano={36} />
                <View style={styles.solapa}>
                  <AvatarPersona nombre={p.nombrePareja} color={p.otra.color} avatarPath={p.otra.avatarPath} tamano={36} />
                </View>
              </View>
              <View style={styles.flex}>
                <Text style={styles.filaTitulo}>
                  Tú y <Text style={{ color: p.tintaPareja }}>{p.nombrePareja}</Text>
                </Text>
                {d?.juntosDesde ? (
                  <Text style={styles.filaValor}>Juntos en ito desde el {fechaDesde(d.juntosDesde)}</Text>
                ) : null}
              </View>
            </View>
          ) : d?.sinPareja?.estado === 'salio' ? (
            <Fila
              titulo={`${d.sinPareja.nombre} salió del espacio`}
              valor="Puede volver con un código nuevo"
              onPress={() => router.push('/pareja/invitar')}
            />
          ) : d?.sinPareja?.estado === 'borrada' ? (
            <Fila
              titulo="Tu pareja borró su cuenta"
              valor="Los gastos compartidos se quedan aquí. Este espacio ya no admite a nadie nuevo."
            />
          ) : (
            <Fila titulo="Esperando a tu pareja" valor="Comparte tu código para que se una" onPress={() => router.push('/pareja/invitar')} />
          )}
        </Seccion>

        {/* Propuesta pendiente o recién respondida */}
        {d?.pendiente && fila ? (
          <BandaPropuesta
            mia={d.pendiente.proposed_by === userId}
            id={d.pendiente.id}
            lineas={textosCambios(fila, d.pendiente.changes, p.yo.slot, p.nombrePareja)}
            nombrePareja={p.nombrePareja}
            tinta={p.tintaPareja}
          />
        ) : d?.respondida ? (
          <View style={[styles.banda, d.respondida.status === 'rejected' && styles.bandaRechazo]}>
            <Text style={styles.bandaTexto}>
              <Text style={{ fontFamily: fonts.bodyBold, color: p.tintaPareja }}>{p.nombrePareja}</Text>{' '}
              {d.respondida.status === 'accepted' ? 'aceptó tu propuesta de cambio.' : 'rechazó tu propuesta: los ajustes siguen igual.'}
            </Text>
          </View>
        ) : null}

        {/* Dinero */}
        <Seccion titulo="DINERO" nota={p.otra ? `Los cambios de dinero los tiene que aceptar ${p.nombrePareja}.` : undefined}>
          {!fila ? (
            datos.isError ? (
              <Text style={styles.nota}>No se han podido cargar los ajustes.</Text>
            ) : (
              <CargandoHilo color={colors.accent} style={{ paddingVertical: 16 }} />
            )
          ) : (
            <>
              <Fila titulo="Reparto de los gastos" valor={resumenReparto(fila, p.yo.slot, p.nombrePareja)} onPress={() => setAbierta('reparto')} />
              {fila.pot_enabled && fila.default_split === 'mixed' ? (
                <Fila titulo="Categorías del bote" valor={listaCategorias(fila.pot_categories)} onPress={() => setAbierta('categorias')} separador />
              ) : null}
              <Fila
                titulo="Bote común"
                valor={
                  fila.pot_enabled
                    ? `${resumenBote(fila)} · ${textoPorcentaje(fila.pot_pct_m1, p.yo.slot, p.nombrePareja).toLowerCase()}`
                    : saldo.data && saldo.data.pot_balance_cents > 0
                      ? `${resumenBote(fila)} · quedan ${formatearImporte(saldo.data.pot_balance_cents)}`
                      : resumenBote(fila)
                }
                onPress={() => setAbierta('bote')}
                separador
              />
            </>
          )}
        </Seccion>

        {/* Privacidad */}
        <Seccion titulo="PRIVACIDAD">
          <FilaInterruptor
            titulo={`Mis gastos personales, visibles para ${p.nombrePareja}`}
            ayuda="Es lo que sale marcado al apuntar un gasto solo tuyo. En cada gasto se puede cambiar."
            valor={valorPrivacidad('share_personal_expenses')}
            onCambiar={(v) => cambiarPrivacidad('share_personal_expenses', v)}
          />
          <FilaInterruptor
            titulo={`Mis pagos recurrentes personales, visibles para ${p.nombrePareja}`}
            ayuda="Como tu gimnasio. En cada pago se puede cambiar."
            valor={valorPrivacidad('share_personal_recurring')}
            onCambiar={(v) => cambiarPrivacidad('share_personal_recurring', v)}
            separador
          />
          <MensajeError texto={errorPrivacidad} />
        </Seccion>

        {/* Presupuestos: preferencia solo de este móvil */}
        <Seccion titulo="PRESUPUESTOS">
          <FilaInterruptor
            titulo="Mostrar presupuestos"
            ayuda="Solo en este móvil. Apagado, no salen presupuestos en planes ni eventos; los planes solo dicen lo gastado."
            valor={presupuestos}
            onCambiar={guardarPresupuestos}
          />
        </Seccion>

        {/* Avisos */}
        <Seccion titulo="AVISOS" nota={enExpoGo ? AVISO_EXPO_GO : undefined}>
          {permiso === 'pendiente' ? (
            <Fila titulo="Avisos en este móvil" valor={textoEstadoPermiso(permiso, enExpoGo)} onPress={() => setAbierta('avisos')} />
          ) : permiso === 'denegado' ? (
            <Fila titulo="Avisos en este móvil" valor={textoEstadoPermiso(permiso, enExpoGo)} onPress={() => Linking.openSettings()} />
          ) : (
            <Fila titulo="Avisos en este móvil" valor={textoEstadoPermiso(permiso ?? 'no_disponible', enExpoGo)} />
          )}
          {AVISOS.map((a) => (
            <FilaInterruptor
              key={a.campo}
              titulo={a.titulo}
              ayuda={a.ayuda}
              valor={avisosLocal[a.campo] ?? d?.avisos[a.campo] ?? true}
              onCambiar={(v) => cambiarAviso(a.campo, v)}
              separador
            />
          ))}
          <MensajeError texto={errorAvisos} />
          {intento && puedePush ? (
            <>
              {!intento.ok ? <MensajeError texto="No se pudo activar los avisos en este móvil. Se reintentará al abrir la app." /> : null}
              <Fila
                titulo={reintentando ? 'Reintentando…' : intento.ok ? 'Registro de avisos' : 'Reintentar'}
                valor={textoIntento(intento)}
                onPress={!intento.ok && !reintentando && permiso === 'concedido' ? reintentar : undefined}
                separador
              />
            </>
          ) : null}
          <Fila
            titulo={prueba.ocupado ? 'Enviando…' : 'Probar aviso'}
            valor={prueba.texto ?? (!puedePush ? 'Disponible en la app instalada' : permiso === 'concedido' ? undefined : 'Activa antes los avisos en este móvil')}
            onPress={puedePush && permiso === 'concedido' && !prueba.ocupado ? probar : undefined}
            separador
          />
        </Seccion>

        {/* Apariencia: preferencia solo de este móvil */}
        <Seccion titulo="APARIENCIA">
          <View accessibilityRole="radiogroup" accessibilityLabel="Apariencia" style={styles.apariencia}>
            {OPCIONES_TEMA.map((o) => (
              <Chip
                key={o.valor}
                etiqueta={o.etiqueta}
                activo={tema === o.valor}
                rol="radio"
                onPress={() => {
                  setTema(o.valor);
                  void guardarTema(o.valor);
                }}
              />
            ))}
          </View>
        </Seccion>

        {/* Cuenta */}
        <Seccion titulo="CUENTA">
          {email ? <Fila titulo="Email" valor={email} /> : null}
          <Fila titulo="Cambiar contraseña" onPress={() => setAbierta('contrasena')} separador={!!email} />
          <Fila titulo={p.otra ? 'Salir del espacio' : 'Eliminar el espacio'} onPress={() => setAbierta('salir')} separador />
          <Fila titulo="Borrar mi cuenta" onPress={() => setAbierta('borrar')} separador peligro />
        </Seccion>

        <Pressable
          accessibilityRole="button"
          onPress={() => cerrarSesion()}
          style={({ pressed }) => [styles.cerrarSesion, pressed && styles.pulsado]}
        >
          <Text style={styles.cerrarSesionTexto}>Cerrar sesión</Text>
        </Pressable>
        {version ? <Text style={styles.version}>ito {version}</Text> : null}
      </ScrollView>

      {abierta === 'avisos' ? <HojaPermisoAvisos onCerrar={cerrar} /> : null}
      {abierta === 'perfil' ? <HojaPerfil onCerrar={cerrar} /> : null}
      {abierta === 'reparto' && fila ? <HojaReparto key={JSON.stringify(fila)} actual={fila} pareja={pareja} onCerrar={cerrar} /> : null}
      {abierta === 'categorias' && fila ? <HojaCategorias key={JSON.stringify(fila)} actual={fila} onCerrar={cerrar} /> : null}
      {abierta === 'bote' && fila ? <HojaBote key={JSON.stringify(fila)} actual={fila} pareja={pareja} onCerrar={cerrar} /> : null}
      {abierta === 'contrasena' ? <HojaContrasena onCerrar={cerrar} /> : null}
      {abierta === 'salir' ? <HojaSalir onCerrar={cerrar} /> : null}
      {abierta === 'borrar' ? <HojaBorrarCuenta onCerrar={cerrar} /> : null}
    </View>
  );
}

/** «14 de noviembre de 2026». */
function fechaDesde(iso: string) {
  const f = new Date(iso);
  return `${f.getDate()} de ${MESES[f.getMonth()].toLowerCase()} de ${f.getFullYear()}`;
}

const OPCIONES_TEMA: { valor: PreferenciaTema; etiqueta: string }[] = [
  { valor: 'sistema', etiqueta: 'Sistema' },
  { valor: 'claro', etiqueta: 'Claro' },
  { valor: 'oscuro', etiqueta: 'Oscuro' },
];

function FilaInterruptor({
  titulo,
  ayuda,
  valor,
  onCambiar,
  separador = false,
}: {
  titulo: string;
  ayuda: string;
  valor: boolean;
  onCambiar: (v: boolean) => void;
  separador?: boolean;
}) {
  const colors = useColores();
  const styles = useStyles();
  return (
    <View style={[styles.interruptor, separador && styles.separador]}>
      <View style={styles.flex}>
        <Text style={styles.filaTitulo}>{titulo}</Text>
        <Text style={styles.filaValor}>{ayuda}</Text>
      </View>
      <Switch
        accessibilityLabel={titulo}
        value={valor}
        onValueChange={onCambiar}
        trackColor={{ true: colors.accent, false: colors.inputBorder }}
        thumbColor={colors.thumb}
        {...{ activeThumbColor: colors.thumb }}
      />
    </View>
  );
}

function Seccion({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.seccion}>
      <Text accessibilityRole="header" style={styles.seccionTitulo}>
        {titulo}
      </Text>
      <View style={styles.caja}>{children}</View>
      {nota ? <Text style={styles.nota}>{nota}</Text> : null}
    </View>
  );
}

function Fila({
  titulo,
  valor,
  onPress,
  separador = false,
  peligro = false,
}: {
  titulo: string;
  valor?: string;
  onPress?: () => void;
  separador?: boolean;
  peligro?: boolean;
}) {
  const colors = useColores();
  const styles = useStyles();
  const contenido = (
    <>
      <View style={styles.flex}>
        <Text style={[styles.filaTitulo, peligro && styles.peligro]}>{titulo}</Text>
        {valor ? <Text style={styles.filaValor}>{valor}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} /> : null}
    </>
  );
  const estilo = [styles.fila, separador && styles.separador];
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [...estilo, pressed && styles.pulsado]}>
      {contenido}
    </Pressable>
  ) : (
    <View style={estilo}>{contenido}</View>
  );
}

/** «Has propuesto… · esperando a Meri · Retirar» o «Meri propone… · Aceptar / Rechazar». */
function BandaPropuesta({
  mia,
  id,
  lineas,
  nombrePareja,
  tinta,
}: {
  mia: boolean;
  id: string;
  lineas: string[];
  nombrePareja: string;
  tinta: string;
}) {
  const styles = useStyles();
  const invalidar = useInvalidarGastos();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accion = async (f: () => Promise<void>) => {
    setOcupado(true);
    setError(null);
    try {
      await f();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido completar. Inténtalo de nuevo.');
    } finally {
      setOcupado(false);
      invalidar();
    }
  };
  return (
    <View style={styles.banda}>
      <Text style={styles.bandaTexto}>
        {mia ? (
          <>
            Has propuesto un cambio · esperando a <Text style={{ fontFamily: fonts.bodyBold, color: tinta }}>{nombrePareja}</Text>
          </>
        ) : (
          <>
            <Text style={{ fontFamily: fonts.bodyBold, color: tinta }}>{nombrePareja}</Text> propone cambiar:
          </>
        )}
      </Text>
      {(lineas.length ? lineas : ['Nada: ya está así']).map((l) => (
        <Text key={l} style={styles.bandaLinea}>
          · {l}
        </Text>
      ))}
      <MensajeError texto={error} />
      <View style={styles.bandaBotones}>
        {mia ? (
          <BotonBanda etiqueta="Retirar propuesta" onPress={() => accion(() => retirarPropuesta(id))} deshabilitado={ocupado} />
        ) : (
          <>
            <BotonBanda etiqueta="Aceptar" principal onPress={() => accion(() => responderPropuesta(id, true))} deshabilitado={ocupado} />
            <BotonBanda etiqueta="Rechazar" onPress={() => accion(() => responderPropuesta(id, false))} deshabilitado={ocupado} />
          </>
        )}
      </View>
    </View>
  );
}

function BotonBanda({
  etiqueta,
  onPress,
  principal = false,
  deshabilitado,
}: {
  etiqueta: string;
  onPress: () => void;
  principal?: boolean;
  deshabilitado: boolean;
}) {
  const colors = useColores();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={deshabilitado}
      onPress={onPress}
      style={[styles.botonBanda, principal ? styles.botonBandaPrincipal : styles.botonBandaNormal, deshabilitado && { opacity: 0.5 }]}
    >
      <Text style={[styles.botonBandaTexto, principal && { color: colors.onAccent }]}>{etiqueta}</Text>
    </Pressable>
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
  contenido: { paddingHorizontal: 20, gap: 20, paddingTop: 8 },
  flex: { flex: 1, gap: 2 },
  pulsado: { opacity: 0.7 },
  perfil: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
  },
  perfilTextos: { flex: 1, gap: 2 },
  perfilNombre: { fontFamily: fonts.title, fontSize: 24, color: colors.text },
  perfilColor: { fontFamily: fonts.bodyBold, fontSize: 13 },
  editar: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.accent },
  seccion: { gap: 8 },
  seccionTitulo: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.textSecondary },
  apariencia: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 14 },
  caja: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl - 4, paddingHorizontal: 14 },
  nota: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 10 },
  separador: { borderTopWidth: 1, borderTopColor: colors.divider },
  filaTitulo: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  filaValor: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  peligro: { color: colors.error },
  pareja: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  avatares: { flexDirection: 'row' },
  solapa: { marginLeft: -10, borderRadius: 20, borderWidth: 2, borderColor: colors.card },
  interruptor: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  banda: { gap: 6, padding: 14, borderRadius: radius.xl - 4, backgroundColor: colors.paymentChip },
  bandaRechazo: { backgroundColor: colors.accentSoft },
  bandaTexto: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.text },
  bandaLinea: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  bandaBotones: { flexDirection: 'row', gap: 8, marginTop: 4 },
  botonBanda: { flex: 1, minHeight: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  botonBandaPrincipal: { backgroundColor: colors.accent },
  botonBandaNormal: { backgroundColor: colors.card },
  botonBandaTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  cerrarSesion: {
    minHeight: 52,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cerrarSesionTexto: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.accent },
  version: { textAlign: 'center', fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
}));
