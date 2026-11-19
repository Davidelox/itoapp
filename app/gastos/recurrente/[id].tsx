import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { BorrarGasto } from '@/components/gastos/BorrarGasto';
import { FormularioRecurrente } from '@/components/gastos/FormularioRecurrente';
import { Hoja } from '@/components/gastos/Hoja';
import { HojaImporte } from '@/components/gastos/HojaImporte';
import { BotonPrincipal, BotonSecundario, EnlaceTexto } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, radius } from '@/constants/theme';
import { formatearImporte } from '@/lib/dinero/importe';
import { type CobroConGasto, editarRecurrente, saltarCobro } from '@/lib/gastos/consultasRecurrentes';
import { ErrorGasto } from '@/lib/gastos/error';
import { personas } from '@/lib/gastos/personas';
import { ESTADO_COBRO, type Recurrente, fechaCobro, proximoCobro } from '@/lib/gastos/recurrentes';
import { useAjustesGastos, useInvalidarGastos, useRecurrente } from '@/lib/gastos/useGastos';
import { type Pareja, useEstado } from '@/lib/pareja/EstadoProvider';

/**
 * Editar un pago recurrente. Como al editar un gasto, el formulario arranca con una copia fija; si la otra
 * persona lo cambia mientras tanto, sale «Recargar». Debajo: últimos cobros, pausar y borrar (en hojas).
 */
export default function EditarRecurrente() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pareja } = useEstado();
  const ajustes = useAjustesGastos();
  const consulta = useRecurrente(id);
  const [copia, setCopia] = useState<Recurrente | null>(null);
  const [guardandoYo, setGuardandoYo] = useState(false);
  // Tras pausar o reanudar desde aquí, la versión nueva es nuestra: se adopta sin avisar de «ha cambiado»
  // (y el formulario guarda después con la versión buena en vez de chocar).
  const [adoptarVersion, setAdoptarVersion] = useState(false);

  if (!copia && consulta.data) setCopia(consulta.data.recurrente);
  if (adoptarVersion && copia && consulta.data && consulta.data.recurrente.version > copia.version) {
    setCopia(consulta.data.recurrente);
    setAdoptarVersion(false);
  }

  if (!pareja || ajustes.isLoading || (consulta.isLoading && !copia)) {
    return (
      <View style={styles.centro}>
        <CargandoHilo size="large" color={colors.accent} />
      </View>
    );
  }
  if (!ajustes.data || !copia) {
    return (
      <View style={styles.centro}>
        <Text style={styles.texto}>Este pago ya no existe.</Text>
      </View>
    );
  }

  const actual = consulta.data?.recurrente ?? null;
  const masNuevo = !guardandoYo && actual && actual.version > copia.version ? actual : null;
  const nombre = personas(pareja).nombrePareja;

  return (
    <View style={styles.raiz}>
      <FormularioRecurrente
        key={`${copia.id}:${copia.version}`}
        pareja={pareja}
        ajustes={ajustes.data}
        inicial={copia}
        alGuardarEdicion={setGuardandoYo}
        extra={
          actual ? (
            <Extras
              recurrente={actual}
              cobros={consulta.data?.cobros ?? []}
              pareja={pareja}
              boteActivo={ajustes.data.boteActivo}
              alPausar={() => setAdoptarVersion(true)}
            />
          ) : null
        }
      />
      {masNuevo ? (
        <View style={styles.aviso} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.avisoTexto}>{nombre} ha cambiado este pago mientras lo editabas.</Text>
          <Pressable accessibilityRole="button" onPress={() => setCopia(masNuevo)} style={styles.avisoBoton}>
            <Text style={styles.avisoEnlace}>Recargar</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Extras({
  recurrente,
  cobros,
  pareja,
  boteActivo,
  alPausar,
}: {
  recurrente: Recurrente;
  cobros: CobroConGasto[];
  pareja: Pareja;
  boteActivo: boolean;
  alPausar: () => void;
}) {
  const router = useRouter();
  const invalidar = useInvalidarGastos();
  const p = personas(pareja);
  const [pausando, setPausando] = useState(false);
  const [importeDe, setImporteDe] = useState<CobroConGasto | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const proximo = proximoCobro({ ...recurrente, paused: false });

  const accion = async (f: () => Promise<void>, alTerminar?: () => void) => {
    setOcupado(true);
    setError(null);
    try {
      await f();
      invalidar();
      alTerminar?.();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido completar. Inténtalo de nuevo.');
      invalidar();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <View style={styles.extras}>
      {!boteActivo && (recurrente.paid_by === 'pot' || recurrente.split_mode === 'pot') && !recurrente.paused ? (
        <Text style={styles.alerta}>El bote está desactivado: este pago no se está apuntando. Elige quién paga o actívalo en Ajustes.</Text>
      ) : null}

      <View style={styles.estado}>
        <Text style={styles.estadoTitulo}>{recurrente.paused ? 'En pausa' : 'Activo'}</Text>
        <Text style={styles.ayuda}>
          {recurrente.paused
            ? 'No se apuntan gastos mientras esté en pausa.'
            : proximo
              ? `Próximo cobro: ${fechaCobro(proximo)}`
              : 'No tiene más cobros.'}
        </Text>
        <BotonSecundario etiqueta={recurrente.paused ? 'Reanudar' : 'Pausar'} onPress={() => setPausando(true)} />
      </View>

      {cobros.length ? (
        <>
          <Text accessibilityRole="header" style={styles.seccion}>
            ÚLTIMOS COBROS
          </Text>
          <View style={styles.lista}>
            {cobros.map((c, i) => (
              <View key={c.id} style={[styles.fila, i < cobros.length - 1 && styles.separador]}>
                <Pressable
                  accessibilityRole="button"
                  disabled={!c.gastoId}
                  onPress={() => c.gastoId && router.push({ pathname: '/gastos/[id]', params: { id: c.gastoId } })}
                  style={styles.filaCuerpo}
                >
                  <Text style={styles.filaFecha}>{fechaCobro(c.due_date)}</Text>
                  <Text style={styles.ayuda}>
                    {c.status === 'paid' && c.amount_cents ? `Apuntado · ${formatearImporte(c.amount_cents)}` : ESTADO_COBRO[c.status]}
                  </Text>
                </Pressable>
                {c.status === 'pending' ? (
                  <EnlaceTexto etiqueta="Poner importe" deshabilitado={ocupado} onPress={() => setImporteDe(c)} />
                ) : c.status === 'skipped' ? (
                  <EnlaceTexto etiqueta="Deshacer" deshabilitado={ocupado} onPress={() => accion(() => saltarCobro(c.id, false))} />
                ) : null}
              </View>
            ))}
          </View>
        </>
      ) : null}
      <MensajeError texto={error} />

      <BorrarGasto gasto={recurrente} pareja={pareja} tipo="recurring_payment" />

      <Hoja
        visible={pausando}
        titulo={recurrente.paused ? `¿Reanudar «${recurrente.name}»?` : `¿Pausar «${recurrente.name}»?`}
        onCerrar={() => setPausando(false)}
        bloqueada={ocupado}
      >
        <Text style={styles.texto}>
          {recurrente.paused
            ? `Se volverá a apuntar desde el próximo cobro${proximo ? ` (${fechaCobro(proximo)})` : ''}. Lo que venció durante la pausa no se apunta.`
            : 'No se apuntarán gastos mientras esté en pausa. Al reanudarlo, lo que venza durante la pausa no se apunta.'}
        </Text>
        <MensajeError texto={error} />
        <BotonPrincipal
          etiqueta={recurrente.paused ? 'Reanudar' : 'Pausar'}
          cargando={ocupado}
          onPress={() =>
            accion(
              async () => {
                await editarRecurrente(recurrente.id, recurrente.version, { paused: !recurrente.paused }, p.nombrePareja);
                alPausar();
              },
              () => setPausando(false),
            )
          }
        />
      </Hoja>

      {importeDe ? (
        <HojaImporte
          cobro={importeDe}
          recurrente={recurrente}
          pareja={pareja}
          onCerrar={() => setImporteDe(null)}
          onHecho={() => {
            setImporteDe(null);
            invalidar();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colors.background },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  texto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text },
  aviso: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 110,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.text,
  },
  avisoTexto: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.white },
  avisoBoton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  avisoEnlace: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.white },
  extras: { gap: 12, marginTop: 12 },
  alerta: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    padding: 12,
  },
  estado: { gap: 6, padding: 14, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  estadoTitulo: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  ayuda: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  seccion: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.textSecondary },
  lista: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl - 4, paddingHorizontal: 14 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56 },
  separador: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  filaCuerpo: { flex: 1, paddingVertical: 8, gap: 2 },
  filaFecha: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
});
