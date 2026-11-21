import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { textoPagador } from '@/components/gastos/FilaGasto';
import { Hoja } from '@/components/gastos/Hoja';
import { BotonNudo } from '@/components/hilo/BotonNudo';
import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { BotonPrincipal, BotonSecundario, EnlaceTexto } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, radius } from '@/constants/theme';
import { formatearImporte } from '@/lib/dinero/importe';
import { ErrorGasto, type Gasto, deshacerPago, leerPago, leerSaldo, saldar } from '@/lib/gastos/consultas';
import { personas } from '@/lib/gastos/personas';
import { type EstadoGrupo, agruparSaldables, alternarGrupo, cuentaGastos, estadoGrupo, lineaPlan, planDe } from '@/lib/gastos/planes';
import { etiquetaReparto } from '@/lib/gastos/reparto';
import {
  METODOS,
  type MetodoPago,
  NOMBRE_METODO,
  type Pago,
  conSigno,
  efectoDe,
  resultadoFinal,
  saldables,
  sePuedeDeshacer,
  textoBoton,
  totalDe,
} from '@/lib/gastos/saldar';
import { useAbiertos, useInvalidarGastos, useSaldo } from '@/lib/gastos/useGastos';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/**
 * Saldar cuentas en una hoja inferior (mockup Saldar, docs/plan-gastos-fase2.md §2): lista, método, botón y
 * el «¡Cuentas a cero!» en la misma hoja. La dirección y el importe los fija el servidor.
 * Los gastos de un plan salen como UNA fila con su casilla de grupo (docs/plan-planificador.md §4); con `plan`, solo los de ese plan.
 */
export function HojaSaldar({ onCerrar, plan }: { onCerrar: () => void; /** «Saldar solo esto»: solo los gastos de este plan, marcados al abrir. */ plan?: { id: string; nombre: string } }) {
  const router = useRouter();
  const { pareja, userId } = useEstado();
  const abiertos = useAbiertos();
  const saldo = useSaldo();
  const invalidar = useInvalidarGastos();
  // Marcados. Al abrir, todo lo que hay; lo que llegue después entra SIN marcar (revisión I1), para que
  // nadie confirme un importe que no ha visto.
  const [marcados, setMarcados] = useState<Set<string> | null>(null);
  const [conocidos, setConocidos] = useState<Set<string> | null>(null);
  const [metodo, setMetodo] = useState<MetodoPago>('bizum');
  const [error, setError] = useState<string | null>(null);
  // Id del pago ligado a la selección y al método: reintentar lo mismo no crea dos pagos, y elegir otra cosa
  // usa un id nuevo (con el antiguo, el servidor devolvería el pago anterior). Revisión I2.
  const idPago = useRef<{ firma: string; id: string } | null>(null);
  const [hecho, setHecho] = useState<{ pago: Pago; resto: number } | null>(null);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const resultado = useRef<{ pago: Pago; resto: number } | null>(null);
  // Mientras el nudo termina, la lista se congela: la recarga no la vacía ni desmonta el botón (revisión I3).
  const [congelada, setCongelada] = useState<Gasto[] | null>(null);

  // Mientras se registra el pago (lista congelada y aún sin final) la hoja no se puede cerrar.
  const envolver = (contenido: React.ReactNode, pie?: React.ReactNode) => (
    <Hoja visible titulo={plan ? 'Saldar solo esto' : 'Saldar cuentas'} onCerrar={onCerrar} bloqueada={!!congelada && !hecho} desplazable pie={pie}>
      {contenido}
    </Hoja>
  );

  if (!pareja || abiertos.isLoading) {
    return envolver(<CargandoHilo color={colors.accent} style={{ marginVertical: 40 }} />);
  }

  const p = personas(pareja);
  const yo = p.yo.slot;

  if (hecho) {
    const r = resultadoFinal(hecho.pago, yo, hecho.resto, p.nombrePareja);
    const puede = sePuedeDeshacer(hecho.pago, userId);
    const deshacer = async () => {
      setDeshaciendo(true);
      setError(null);
      try {
        try {
          await deshacerPago(hecho.pago.id);
        } catch (e) {
          // Si el intento anterior sí llegó, el pago ya no existe: está deshecho.
          if (!(e instanceof ErrorGasto && e.codigo === 'TW022') || (await leerPago(hecho.pago.id))) throw e;
        }
        invalidar();
        setHecho(null);
        setCongelada(null);
        idPago.current = null;
      } catch (e) {
        setError(e instanceof ErrorGasto ? e.message : 'No se ha podido deshacer.');
      } finally {
        setDeshaciendo(false);
      }
    };
    return envolver(
      <View style={styles.final} accessibilityLiveRegion="polite">
        <View style={styles.check}>
          <Ionicons name="checkmark" size={46} color={colors.accent} />
        </View>
        <Text accessibilityRole="header" style={styles.finalTitulo}>
          {r.titulo}
        </Text>
        <Text style={styles.finalTexto}>{r.texto}</Text>
        {r.queda ? <Text style={styles.queda}>{r.queda}</Text> : null}
        <MensajeError texto={error} />
        {puede ? <EnlaceTexto etiqueta={deshaciendo ? 'Deshaciendo…' : 'Deshacer'} deshabilitado={deshaciendo} onPress={deshacer} /> : null}
        <EnlaceTexto
          etiqueta="Ver historial de pagos"
          onPress={() => {
            onCerrar();
            router.push({
              pathname: '/gastos/historial',
              params: { ver: 'pagos' },
            });
          }}
        />
        <View style={styles.finalBoton}>
          <BotonPrincipal etiqueta="Cerrar" onPress={onCerrar} />
        </View>
      </View>,
    );
  }

  if (abiertos.isError || !abiertos.data) {
    return envolver(
      <View style={styles.vacio}>
        <Text style={styles.vacioTexto}>No se han podido cargar los gastos.</Text>
        <BotonSecundario etiqueta="Reintentar" onPress={() => abiertos.refetch()} />
      </View>,
    );
  }

  const aSaldar = saldables(yo, abiertos.data.gastos, abiertos.data.pendientesDeBorrar);
  const lista = congelada ?? (plan ? aSaldar.filter((g) => g.plan_id === plan.id) : aSaldar);
  // Lo que sigue en el saldo pero no se puede saldar porque está pendiente de borrar (decisión 1).
  const porBorrar = totalDe(
    yo,
    abiertos.data.gastos.filter((g) => abiertos.data?.pendientesDeBorrar.has(g.id) && g.settlement_id === null),
  );
  if (!marcados && !congelada) {
    const ids = new Set(lista.map((g) => g.id));
    setMarcados(ids);
    setConocidos(ids);
  }
  const elegidos = lista.filter((g) => marcados?.has(g.id));
  const nuevos = conocidos ? lista.filter((g) => !conocidos.has(g.id)).length : 0;
  const total = totalDe(yo, elegidos);
  const resto = totalDe(yo, lista) - total;
  const todos = elegidos.length === lista.length;
  // Si la pareja ha salido, nadie podría confirmar un «He pagado» (revisión M3).
  const sinQuienConfirme = !p.otra && total < 0;

  if (lista.length === 0) {
    const espera = saldo.data?.awaiting_confirmation_cents ?? 0;
    return envolver(
      <View style={styles.vacio}>
        <Ionicons name="checkmark-circle-outline" size={44} color={colors.textSecondary} />
        <Text style={styles.vacioTitulo}>Nada que saldar</Text>
        <Text style={styles.vacioTexto}>
          {plan
            ? 'No queda nada de este plan por saldar.'
            : espera !== 0
            ? `Lo pendiente (${formatearImporte(Math.abs(espera))}) está esperando a que se confirme el pago.`
            : porBorrar !== 0
              ? `Lo que queda (${formatearImporte(Math.abs(porBorrar))}) está pendiente de borrar: no se puede saldar hasta que se resuelva.`
              : 'No hay gastos pendientes entre vosotros.'}
        </Text>
      </View>,
    );
  }

  const alternar = (id: string) =>
    setMarcados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const confirmar = async () => {
    if (elegidos.length === 0 || sinQuienConfirme) throw new Error('nada');
    setError(null);
    const ids = elegidos.map((g) => g.id).sort();
    const firma = `${metodo}:${ids.join(',')}`;
    if (idPago.current?.firma !== firma) idPago.current = { firma, id: Crypto.randomUUID() };
    try {
      setCongelada(lista);
      const pago = await saldar(idPago.current.id, ids, metodo, yo === 'm1' ? total : -total);
      // Lo que queda, según el servidor (incluye lo pendiente de borrar, que no se puede saldar). Revisión I6.
      const s = await leerSaldo().catch(() => null);
      const queda = s ? s.partner_owes_me_cents - s.awaiting_confirmation_cents : resto + porBorrar;
      resultado.current = { pago, resto: queda };
      // Por si el nudo no llega a avisar (pantalla sin animaciones o desmontada), el final sale igual.
      setTimeout(() => mostrarFinal(), 2500);
    } catch (e) {
      setCongelada(null);
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido saldar. Inténtalo de nuevo.');
      if (e instanceof ErrorGasto && e.codigo === 'TW020') invalidar();
      throw e;
    }
  };

  function mostrarFinal() {
    if (!resultado.current) return;
    setHecho(resultado.current);
    resultado.current = null;
    invalidar();
  }

  const deParte = total >= 0 ? p.otra : p.yo;
  const aParte = total >= 0 ? p.yo : p.otra;
  const avatar = (m: typeof p.yo | null, nombre: string) => (
    <AvatarPersona nombre={nombre} color={m?.color ?? null} avatarPath={m?.avatarPath} tamano={40} />
  );

  return envolver(
    <>
      <View style={styles.resumen}>
        <View style={styles.flecha} importantForAccessibility="no-hide-descendants">
          {avatar(deParte, deParte === p.yo ? p.yo.nombre : p.nombrePareja)}
          <Ionicons name="arrow-forward" size={22} color={colors.textSecondary} />
          {avatar(aParte, aParte === p.yo ? p.yo.nombre : p.nombrePareja)}
        </View>
        <Text style={styles.resumenTexto}>
          {total > 0 ? (
            <>
              <Text style={[styles.nombre, { color: p.tintaPareja }]}>{p.nombrePareja}</Text> te debe
            </>
          ) : total < 0 ? (
            <>
              Debes a <Text style={[styles.nombre, { color: p.tintaPareja }]}>{p.nombrePareja}</Text>
            </>
          ) : elegidos.length ? (
            'Los gastos elegidos se compensan'
          ) : (
            'Elige qué quieres saldar'
          )}
        </Text>
        <Text style={styles.resumenImporte}>{formatearImporte(Math.abs(total))}</Text>
      </View>

      <Text accessibilityRole="header" style={styles.seccion}>
        QUÉ VAS A SALDAR
      </Text>
      {nuevos > 0 ? (
        <Text style={styles.aviso} accessibilityLiveRegion="polite">
          {nuevos === 1 ? 'Hay 1 gasto nuevo' : `Hay ${nuevos} gastos nuevos`} sin marcar: revísalo antes de saldar.
        </Text>
      ) : null}
      <View style={styles.lista}>
        <Casilla
          marcada={todos}
          onPress={() => {
            setMarcados(todos ? new Set() : new Set(lista.map((g) => g.id)));
            setConocidos(new Set(lista.map((g) => g.id)));
          }}
          titulo="Seleccionar todo"
          derecha={`${elegidos.length} de ${lista.length}`}
          negrita
        />
        {(plan ? lista.map((gasto) => ({ tipo: 'gasto' as const, gasto })) : agruparSaldables(lista)).map((fila) => {
          if (fila.tipo === 'plan') {
            const ids = fila.gastos.map((x) => x.id);
            const info = planDe(fila.gastos[0]);
            return (
              <Casilla
                key={`plan:${fila.planId}`}
                estado={estadoGrupo(ids, marcados)}
                marcada={estadoGrupo(ids, marcados) === 'todos'}
                onPress={() => setMarcados((prev) => alternarGrupo(prev, ids))}
                titulo={info ? lineaPlan(info) : 'Plan'}
                etiqueta={`Plan ${info?.nombre ?? ''}, ${cuentaGastos(ids.length)}`}
                subtitulo={<Text style={styles.sub}>{cuentaGastos(ids.length)} del plan</Text>}
                derecha={conSigno(totalDe(yo, fila.gastos))}
              />
            );
          }
          const g = fila.gasto;
          const pag = textoPagador(g, pareja);
          return (
            <Casilla
              key={g.id}
              marcada={!!marcados?.has(g.id)}
              onPress={() => alternar(g.id)}
              titulo={g.concept}
              subtitulo={
                <Text style={styles.sub}>
                  <Text style={[styles.subNombre, { color: pag.color }]}>{pag.texto}</Text> ·{' '}
                  {etiquetaReparto(g.split_mode, yo, g.split_pct_m1, p.nombrePareja)}
                </Text>
              }
              derecha={conSigno(efectoDe(yo, g))}
            />
          );
        })}
        <View style={styles.totalFila}>
          <Text style={styles.totalTexto}>Total seleccionado</Text>
          <Text style={styles.totalImporte}>{conSigno(total)}</Text>
        </View>
      </View>

      <Text accessibilityRole="header" style={styles.seccion}>
        ¿CÓMO SE PAGA?
      </Text>
      <View style={styles.metodos} accessibilityRole="radiogroup" accessibilityLabel="¿Cómo se paga?">
        {METODOS.map((m) => {
          const activo = metodo === m;
          return (
            <Pressable
              key={m}
              accessibilityRole="radio"
              accessibilityState={{ checked: activo }}
              onPress={() => setMetodo(m)}
              style={[styles.metodo, activo ? styles.metodoActivo : styles.metodoNormal]}
            >
              <Text style={styles.metodoTexto}>{NOMBRE_METODO[m]}</Text>
            </Pressable>
          );
        })}
      </View>
      {sinQuienConfirme ? (
        <Text style={styles.aviso}>
          Tu pareja ha salido del espacio: no hay quien confirme un pago tuyo. Solo puedes registrar lo que te paguen a ti.
        </Text>
      ) : null}
      <MensajeError texto={error} />
    </>,
    <>
      <BotonNudo
        label={textoBoton(total, elegidos.length)}
        labelHecho="Hecho"
        labelError="No se ha podido saldar"
        disabled={elegidos.length === 0 || sinQuienConfirme}
        onPress={confirmar}
        onHecho={() => setTimeout(mostrarFinal, 700)}
      />
      <View style={styles.nota}>
        <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
        <Text style={styles.notaTexto}>Si paga quien debe, la otra persona lo confirma en su app</Text>
      </View>
    </>,
  );
}

function Casilla({
  marcada,
  onPress,
  titulo,
  subtitulo,
  derecha,
  negrita = false,
  estado,
  etiqueta,
}: {
  /** Casilla de grupo: «algunos» se pinta como mixta. */
  estado?: EstadoGrupo;
  /** Lo que lee el lector de pantalla si no es «título, importe» (por ejemplo, para no leer un emoji). */
  etiqueta?: string;
  marcada: boolean;
  onPress: () => void;
  titulo: string;
  subtitulo?: React.ReactNode;
  derecha: string;
  negrita?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: estado === 'algunos' ? 'mixed' : marcada }}
      accessibilityLabel={`${etiqueta ?? titulo}, ${derecha}`}
      onPress={onPress}
      style={styles.casilla}
    >
      <View style={[styles.caja, marcada || estado === 'algunos' ? styles.cajaMarcada : styles.cajaVacia]}>
        {marcada ? <Ionicons name="checkmark" size={16} color={colors.white} /> : estado === 'algunos' ? <Ionicons name="remove" size={16} color={colors.white} /> : null}
      </View>
      <View style={styles.casillaTextos}>
        <Text style={[styles.casillaTitulo, negrita && { fontFamily: fonts.bodyBold }]} numberOfLines={1}>
          {titulo}
        </Text>
        {subtitulo}
      </View>
      <Text style={negrita ? styles.casillaCuenta : styles.casillaImporte}>{derecha}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  resumen: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 6,
  },
  flecha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resumenTexto: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textSecondary,
  },
  nombre: { fontFamily: fonts.bodyBold },
  resumenImporte: {
    fontFamily: fonts.title,
    fontSize: 42,
    lineHeight: 46,
    color: colors.text,
  },
  seccion: {
    marginTop: 6,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  lista: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl - 4,
    paddingHorizontal: 14,
  },
  casilla: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  caja: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cajaMarcada: { backgroundColor: colors.accent },
  cajaVacia: {
    borderWidth: 2,
    borderColor: colors.textSecondary,
    backgroundColor: colors.white,
  },
  casillaTextos: { flex: 1, minWidth: 0, gap: 1 },
  casillaTitulo: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.text,
  },
  casillaImporte: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.text,
  },
  casillaCuenta: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
  },
  sub: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
  subNombre: { fontFamily: fonts.bodyBold },
  totalFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  totalTexto: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  totalImporte: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.text,
  },
  metodos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metodo: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metodoNormal: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.white,
    margin: 1,
  },
  metodoActivo: {
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  metodoTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  nota: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  notaTexto: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  final: { paddingVertical: 16, alignItems: 'center', gap: 10 },
  check: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finalTitulo: {
    fontFamily: fonts.title,
    fontSize: 28,
    color: colors.text,
    textAlign: 'center',
  },
  finalTexto: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 22,
    color: colors.icon,
    textAlign: 'center',
  },
  queda: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  finalBoton: { alignSelf: 'stretch', marginTop: 6 },
  aviso: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 12,
  },
  vacio: { alignItems: 'center', gap: 10, padding: 32 },
  vacioTitulo: { fontFamily: fonts.title, fontSize: 21, color: colors.text },
  vacioTexto: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
