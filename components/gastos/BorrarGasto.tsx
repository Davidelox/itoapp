import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Hoja } from '@/components/gastos/Hoja';
import { BotonPrincipal, BotonSecundario, EnlaceTexto } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { diaMesCorto, rangoCorto } from '@/lib/calendario/rejilla';
import { ErrorGasto, type TipoBorrable, pedirBorrar, responderBorrado, retirarBorrado } from '@/lib/gastos/consultas';
import { personas } from '@/lib/gastos/personas';
import { useInvalidarGastos, useSolicitudBorrado } from '@/lib/gastos/useGastos';
import { ayudaBorradoPlanPendiente, textoBorrarPlan } from '@/lib/planificador/borrado';
import { useInvalidarPlanificador } from '@/lib/planificador/usePlanificador';
import { avisoBorradoColeccion, textoHojaBorrarColeccion, type PrevisionBorrado } from '@/lib/mapa/borradoColeccion';
import { previsionBorrarColeccion } from '@/lib/mapa/consultasColecciones';
import { useInvalidarMapa, useQuitarColeccionDeCache } from '@/lib/mapa/useSitios';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

/** «15 mar 2027»: la fecha de una repetición, siempre con el año (se borra una concreta). */
const diaConAnio = (iso: string) => `${diaMesCorto(iso)} ${iso.slice(0, 4)}`;

/**
 * Qué se quita al borrar «solo esta vez»: «el 15 mar 2027» o, si la repetición dura varios días, «esta vez
 * (14 – 16 mar)». `fecha` es el INICIO de la repetición (lo que identifica la fecha ante el servidor).
 */
const descripcionDia = (fecha: string, fin?: string | null) =>
  fin && fin > fecha ? `esta vez (${rangoCorto(fecha, fin)})` : `el ${diaConAnio(fecha)}`;

/** Qué se quiere borrar de un evento repetido: solo la repetición de esa fecha o toda la serie. */
type Alcance = 'dia' | 'serie';

/**
 * Borrar un gasto, un pago recurrente o un evento (docs/plan-gastos-fase2.md §5, docs/plan-calendario.md §2).
 * Lo privado (o sin pareja) se borra al momento; lo compartido necesita que la otra persona lo apruebe.
 * Mientras tanto sigue contando en el saldo (decisión 1 de David).
 * En un evento que se repite, primero se pregunta «¿Qué quieres borrar?» (solo ese día o toda la serie).
 */
export function BorrarGasto({
  gasto,
  pareja,
  tipo = 'expense',
  fecha = null,
  repetido = false,
  fin = null,
  nombre,
  parte = 'todo',
}: {
  /** Un gasto, un pago recurrente (`tipo: 'recurring_payment'`) o un evento (`tipo: 'event'`, con `visible_to_partner = !is_secret`). */
  gasto: { id: string; visible_to_partner: boolean; liquidacion?: unknown; /** Colección: su nombre, para la hoja. */ name?: string };
  pareja: Pareja;
  tipo?: TipoBorrable;
  /** Evento: la fecha de INICIO de la repetición que se está mirando. */
  fecha?: string | null;
  /** Evento: el último día de esa repetición, si dura varios días («Solo esta vez (14 – 16 mar)»). */
  fin?: string | null;
  /** Evento: si se repite (entonces se pregunta si se borra solo `fecha` o toda la serie). */
  repetido?: boolean;
  /** Cómo se llama lo que se borra en los textos («cumpleaños»); por defecto, según el tipo. */
  nombre?: string;
  /** `banda`: solo el aviso de borrado pendiente (arriba de una pantalla); `pie`: solo el enlace de borrar; `todo`: lo que toque. */
  parte?: 'banda' | 'pie' | 'todo';
}) {
  const colors = useColores();
  const styles = useStyles();
  const router = useRouter();
  const invalidarGastos = useInvalidarGastos();
  const invalidarMapa = useInvalidarMapa();
  const quitarColeccionDeCache = useQuitarColeccionDeCache();
  const invalidarPlanificador = useInvalidarPlanificador();
  // Las colecciones son del Mapa: mismo refresco, misma pantalla de vuelta y mismo texto de «Sigue en el mapa».
  const esSitio = tipo === 'place' || tipo === 'collection';
  const esPlan = tipo === 'plan';
  // Un plan toca el Planificador, el calendario (su banda), el mapa (su colección) y los gastos (lo gastado).
  const invalidar = () => (esPlan ? Promise.all([invalidarPlanificador(), invalidarGastos()]) : esSitio ? invalidarMapa() : invalidarGastos());
  const esEvento = tipo === 'event';
  const esColeccion = tipo === 'collection';
  const [prevision, setPrevision] = useState<PrevisionBorrado | null>(null);
  const ofreceDia = esEvento && repetido && !!fecha;
  const serie = useSolicitudBorrado(gasto.id, tipo, null);
  const delDia = useSolicitudBorrado(gasto.id, tipo, ofreceDia ? fecha : null);
  const solicitud = { data: serie.data ?? (ofreceDia ? delDia.data : null) };
  const cosa = nombre ?? (tipo === 'recurring_payment' ? 'pago' : esEvento ? 'evento' : tipo === 'collection' ? 'colección' : esSitio ? 'sitio' : esPlan ? 'plan' : 'gasto');
  const p = personas(pareja, colors);
  // Hoja de borrado: «alcance» (solo eventos repetidos) y «confirmar».
  const [paso, setPaso] = useState<'alcance' | 'confirmar' | null>(null);
  const [alcance, setAlcance] = useState<Alcance>('serie');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un id por cada vez que se abre la confirmación: reintentar en ella no crea dos solicitudes, y volver a
  // pedirlo tras retirarlo o un rechazo crea una nueva (con el id viejo el servidor devolvería la antigua). I5.
  const [idSolicitud, setIdSolicitud] = useState(() => Crypto.randomUUID());
  const abrirConfirmacion = () => {
    setIdSolicitud(Crypto.randomUUID());
    setError(null);
    setAlcance('serie');
    setPaso(ofreceDia ? 'alcance' : 'confirmar');
    if (esColeccion) {
      // Orientativa y sin bloquear: mientras llega (o si falla) se ve el texto genérico y el botón ya funciona.
      setPrevision(null);
      void previsionBorrarColeccion(gasto.id).then(setPrevision);
    }
  };
  const elegirAlcance = (a: Alcance) => {
    // Un id nuevo por alcance: «solo este día» y «toda la serie» son solicitudes distintas.
    setIdSolicitud(Crypto.randomUUID());
    setAlcance(a);
    setPaso('confirmar');
  };

  // Un plan borrado vuelve a la lista del Planificador (su detalle ya no existe), no a Gastos.
  const volver = () =>
    esPlan
      ? router.dismissTo('/planificador')
      : router.canGoBack()
        ? router.back()
        : router.replace(esEvento ? '/calendario' : esColeccion ? '/mapa/colecciones' : esSitio ? '/mapa' : '/gastos');
  const accion = async (f: () => Promise<boolean | void>) => {
    setOcupado(true);
    setError(null);
    try {
      const borrado = await f();
      invalidar();
      setPaso(null);
      if (borrado === true) volver();
    } catch (e) {
      // Tras un reintento, «no encontrado» quiere decir que ya se borró. En un evento puede ser también
      // «no ocurre ese día»: ahí se enseña el mensaje en vez de salir.
      if (e instanceof ErrorGasto && e.codigo === 'TW060' && !esEvento) {
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
    return parte === 'banda' ? null : <Text style={styles.nota}>Saldado: no se puede borrar.</Text>;
  }

  const s = solicitud.data;
  if (s ? parte === 'pie' : parte === 'banda') return null;
  // «Solo el 15 mar 2027» cuando lo pedido es una repetición y no toda la serie.
  const soloDia = s?.occurrence_date ? `Solo se quitaría ${descripcionDia(s.occurrence_date, s.occurrence_date === fecha ? fin : null)}. ` : '';
  if (s && s.requested_by === p.yo.userId) {
    return (
      <View style={styles.banda} accessibilityRole="summary">
        <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
        <View style={styles.bandaTextos}>
          <Text style={styles.bandaTitulo}>
            Pendiente de borrar · esperando a <Text style={{ color: p.tintaPareja }}>{p.nombrePareja}</Text>
          </Text>
          <Text style={styles.bandaAyuda}>
            {esPlan
              ? ayudaBorradoPlanPendiente(p.nombrePareja)
              : tipo === 'recurring_payment'
              ? `Se sigue apuntando hasta que ${p.nombrePareja} lo apruebe.`
              : esEvento
                ? `${soloDia}Sigue en el calendario hasta que ${p.nombrePareja} lo apruebe.`
                : esSitio
                  ? `Sigue en el mapa hasta que ${p.nombrePareja} lo apruebe.`
                  : `Sigue en vuestro saldo hasta que ${p.nombrePareja} lo apruebe. No se puede saldar mientras tanto.`}
          </Text>
          <MensajeError texto={error} />
        </View>
        <Pressable accessibilityRole="button" disabled={ocupado} onPress={() => accion(() => retirarBorrado(s.id))} style={styles.bandaBoton}>
          <Text style={styles.bandaEnlace}>{esPlan ? 'Retirar solicitud' : 'Retirar'}</Text>
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
        <Text style={styles.bandaAyuda}>
          {soloDia}Si no respondes en 7 días, el {cosa} se queda.
        </Text>
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
  // La fecha concreta que se borra (solo un evento repetido, si se ha elegido «Solo el …»); null = todo.
  const diaElegido = esEvento && alcance === 'dia' ? fecha : null;
  const hojaColeccion = esColeccion ? textoHojaBorrarColeccion(prevision, nombre ?? gasto.name ?? 'colección', p.nombrePareja) : null;
  const textosPlan = esPlan ? textoBorrarPlan(alMomento, p.nombrePareja) : null;
  const queBorra = diaElegido ? `solo ${descripcionDia(diaElegido, fin)}` : `este ${cosa}`;

  return (
    <View style={styles.pie}>
      <EnlaceTexto etiqueta={textosPlan ? textosPlan.enlace : alMomento || esColeccion ? `Borrar ${cosa}` : `Pedir borrar este ${cosa}`} onPress={abrirConfirmacion} />
      {!alMomento && !esColeccion ? <Text style={styles.nota}>{p.nombrePareja} tendrá que aprobarlo</Text> : null}
      {/* Mockup DetalleGasto: la confirmación es una hoja inferior. */}
      <Hoja
        visible={paso !== null}
        titulo={
          textosPlan ? textosPlan.titulo : hojaColeccion ? hojaColeccion.titulo : paso === 'alcance' ? '¿Qué quieres borrar?' : alMomento ? `¿Borrar ${queBorra}?` : `¿Pedir borrar ${queBorra}?`
        }
        onCerrar={() => setPaso(null)}
        bloqueada={ocupado}
        alerta
      >
        {paso === 'alcance' && fecha ? (
          <View style={styles.alcances}>
            <OpcionAlcance
              titulo={fin && fin > fecha ? `Solo esta vez (${rangoCorto(fecha, fin)})` : `Solo el ${diaConAnio(fecha)}`}
              detalle="El evento sigue en las demás fechas."
              onPress={() => elegirAlcance('dia')} />
            <OpcionAlcance titulo="Toda la serie" detalle="Se borran todas las repeticiones." onPress={() => elegirAlcance('serie')} />
            <BotonSecundario etiqueta="Cancelar" onPress={() => setPaso(null)} />
          </View>
        ) : (
          <>
            <Text style={styles.cajaTexto}>
              {textosPlan ? textosPlan.texto : hojaColeccion ? hojaColeccion.texto : alMomento ? 'No se puede deshacer.' : `${p.nombrePareja} tendrá que aprobarlo. Si no responde en 7 días, el ${cosa} se queda.`}
              {tipo === 'recurring_payment' ? ' Los gastos que ya se apuntaron se quedan.' : ''}
              {esEvento && !alMomento ? ' Los gastos se conservan.' : ''}
            </Text>
            <MensajeError texto={error} />
            <View style={styles.dosBotones}>
              <View style={{ flex: 1 }}>
                <BotonSecundario etiqueta="Cancelar" deshabilitado={ocupado} onPress={() => setPaso(null)} />
              </View>
              {hojaColeccion && !hojaColeccion.boton ? null : (
                <View style={{ flex: 1 }}>
                  <BotonPrincipal
                    etiqueta={textosPlan?.boton ?? hojaColeccion?.boton ?? (alMomento ? 'Borrar' : 'Enviar solicitud')}
                    cargando={ocupado}
                    onPress={() =>
                      accion(async () => {
                        const r = await pedirBorrar(idSolicitud, gasto.id, tipo, diaElegido);
                        if (esColeccion) {
                          // Realtime no avisa a quien deja de verla: se quita de la caché ya.
                          if (r.borrado) quitarColeccionDeCache(gasto.id);
                          Alert.alert(avisoBorradoColeccion(r, p.nombrePareja));
                        }
                        return r.borrado;
                      })
                    }
                  />
                </View>
              )}
            </View>
          </>
        )}
      </Hoja>
    </View>
  );
}

/** Una de las dos opciones de «¿Qué quieres borrar?»: tarjeta tocable de al menos 56 px. */
function OpcionAlcance({ titulo, detalle, onPress }: { titulo: string; detalle: string; onPress: () => void }) {
  const colors = useColores();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. ${detalle}`}
      onPress={onPress}
      style={({ pressed }) => [styles.alcance, pressed && { backgroundColor: colors.surface }]}
    >
      <View style={styles.alcanceTextos}>
        <Text style={styles.alcanceTitulo}>{titulo}</Text>
        <Text style={styles.bandaAyuda}>{detalle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const useStyles = crearEstilos((colors) => ({
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
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cajaTitulo: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  cajaTexto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.icon },
  dosBotones: { flexDirection: 'row', gap: 8 },
  alcances: { gap: 8 },
  alcance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 60,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  alcanceTextos: { flex: 1, gap: 1 },
  alcanceTitulo: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
}));
