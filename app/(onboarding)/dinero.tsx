import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BotonNudo } from '@/components/hilo/BotonNudo';
import { CampoTexto } from '@/components/onboarding/CampoTexto';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { GrupoOpciones, OpcionRadio, Segmentado } from '@/components/onboarding/OpcionRadio';
import { Pantalla } from '@/components/onboarding/Pantalla';
import { type ColorPersona, fonts, type Paleta, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { formatearEuros, leerEuros } from '@/lib/dinero/importe';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { type AjustesDinero, guardarDinero } from '@/lib/pareja/acciones';

const PAUSA_NUDO_MS = 1500;
const PASO_PCT = 5;
const PCT_INICIAL = 60;

type Reparto = AjustesDinero['reparto'];

/**
 * Paso 3 de 4, solo para quien crea el espacio: bote común, cómo se rellena, cuánto pone cada uno y
 * reparto por defecto de los gastos (mockup «Reparto»). Un único porcentaje «Proporcional» para todo
 * (docs/modelo-datos.md, decisión 5): es lo que gana cada uno, sirva para el bote o para los gastos.
 */
export default function Dinero() {
  const colors = useColores();
  const styles = useStyles();
  const { pareja, refrescar, retenerFase, soltarFase } = useEstado();
  const miColor = pareja?.yo.color ? colors.personas[pareja.yo.color] : null;

  const [bote, setBote] = useState(true);
  const [mensual, setMensual] = useState(true);
  const [importe, setImporte] = useState('');
  const [dia, setDia] = useState('1');
  const [aporte, setAporte] = useState<'half' | 'proportional'>('half');
  const [reparto, setReparto] = useState<Reparto>('mixed');
  const [pct, setPct] = useState(PCT_INICIAL);
  const [error, setError] = useState<string | null>(null);

  // Sin bote no existen «Mixto» ni «Todo al bote»: se pasa a medias.
  const repartoEfectivo: Reparto = !bote && (reparto === 'mixed' || reparto === 'all_pot') ? 'half' : reparto;
  const cents = leerEuros(importe);
  const diaNum = /^\d{1,2}$/.test(dia) ? Number(dia) : NaN;
  const diaValido = diaNum >= 1 && diaNum <= 31;
  const pctBote = aporte === 'half' ? 50 : pct;

  const errorImporte = importe.trim() !== '' && cents === null ? 'Escribe un importe, por ejemplo 1.000.' : null;
  const errorDia = dia.trim() !== '' && !diaValido ? 'Un día del 1 al 31.' : null;
  const completo = !bote || !mensual || (cents !== null && diaValido);

  const continuar = async () => {
    if (!pareja || !completo) throw new Error('dinero_incompleto');
    setError(null);
    retenerFase();
    const r = await guardarDinero(pareja.coupleId, {
      bote,
      rellenoMensual: mensual,
      aportacionCents: cents,
      diaAportacion: diaValido ? diaNum : null,
      pctBoteM1: pctBote,
      reparto: repartoEfectivo,
      pctProporcionalM1: pct,
    });
    if (!r.ok) {
      soltarFase();
      setError(r.mensaje);
      if (r.codigo === 'pareja_unida') await refrescar();
      throw new Error(r.codigo ?? 'dinero_fallo');
    }
    await refrescar();
  };

  const controlPct = <ControlPorcentaje pct={pct} onCambiar={setPct} miColor={miColor} />;

  return (
    <Pantalla
      paso={3}
      titulo="¿Cómo os organizáis el dinero?"
      subtitulo="Lo podréis cambiar en Ajustes."
      pie={
        <BotonNudo
          label="Continuar"
          labelHecho="Todo listo"
          labelError="No se ha podido guardar"
          disabled={!completo}
          onPress={continuar}
          onHecho={() => soltarFase(PAUSA_NUDO_MS)}
        />
      }
    >
      <GrupoOpciones
        pregunta="¿Tenéis un bote común?"
        ayuda="El bote común es un saldo compartido que se va rellenando y del que salen los gastos de casa. Es opcional."
      >
        <Segmentado
          etiqueta="¿Tenéis un bote común?"
          opciones={[
            { valor: 'si', etiqueta: 'Sí' },
            { valor: 'no', etiqueta: 'No (todavía)' },
          ]}
          valor={bote ? 'si' : 'no'}
          onCambiar={(v) => setBote(v === 'si')}
        />
      </GrupoOpciones>

      {bote ? (
        <>
          <GrupoOpciones pregunta="¿Cómo se rellena?">
            <OpcionRadio
              titulo="Aportación fija cada mes"
              detalle="Se suma sola al bote el día que elijáis."
              elegida={mensual}
              onElegir={() => setMensual(true)}
            />
            <OpcionRadio
              titulo="A mano"
              detalle="Cada uno añade dinero al bote cuando quiera."
              elegida={!mensual}
              onElegir={() => setMensual(false)}
            />
            {mensual ? (
              <View style={styles.dosCampos}>
                <View style={styles.campo}>
                  <CampoTexto
                    etiqueta="Importe al mes (€)"
                    value={importe}
                    onChangeText={setImporte}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    error={errorImporte}
                  />
                </View>
                <View style={styles.campo}>
                  <CampoTexto
                    etiqueta="Día del mes"
                    value={dia}
                    onChangeText={(t) => setDia(t.replace(/\D/g, ''))}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    maxLength={2}
                    error={errorDia}
                    ayuda={diaNum >= 29 && diaValido ? 'Si el mes es más corto, el último día.' : undefined}
                  />
                </View>
              </View>
            ) : null}
          </GrupoOpciones>

          <GrupoOpciones pregunta="¿Cuánto pone cada uno?">
            <OpcionRadio
              titulo="A medias"
              detalle="Cada uno pone la mitad."
              elegida={aporte === 'half'}
              onElegir={() => setAporte('half')}
            />
            <OpcionRadio
              titulo="Proporcional"
              detalle="Según lo que gana cada uno."
              elegida={aporte === 'proportional'}
              onElegir={() => setAporte('proportional')}
              extra={controlPct}
            />
            <Text style={styles.resumen}>
              {mensual && cents !== null ? 'Cada mes: ' : 'Cada uno pone: '}
              <Text style={[styles.resumenNombre, miColor && { color: miColor.ink }]}>
                Tú {mensual && cents !== null ? formatearEuros(Math.round((cents * pctBote) / 100)) : `${pctBote}\u00a0%`}
              </Text>
              {' · '}
              <Text style={styles.resumenNombre}>
                Tu pareja{' '}
                {mensual && cents !== null ? formatearEuros(cents - Math.round((cents * pctBote) / 100)) : `${100 - pctBote}\u00a0%`}
              </Text>
            </Text>
          </GrupoOpciones>
        </>
      ) : null}

      <GrupoOpciones pregunta="Reparto por defecto de los gastos">
        {bote ? (
          <>
            <OpcionRadio
              titulo="Mixto"
              detalle="Hogar, Súper y Suscripciones van al bote; el resto, a medias."
              recomendada
              elegida={repartoEfectivo === 'mixed'}
              onElegir={() => setReparto('mixed')}
            />
            <OpcionRadio
              titulo="Todo al bote"
              detalle="Todos los gastos salen del bote común."
              elegida={repartoEfectivo === 'all_pot'}
              onElegir={() => setReparto('all_pot')}
            />
          </>
        ) : null}
        <OpcionRadio
          titulo="A medias"
          detalle="Cada gasto se divide a partes iguales."
          elegida={repartoEfectivo === 'half'}
          onElegir={() => setReparto('half')}
        />
        <OpcionRadio
          titulo="Proporcional"
          detalle="Según lo que gana cada uno."
          elegida={repartoEfectivo === 'proportional'}
          onElegir={() => setReparto('proportional')}
          extra={controlPct}
        />
        <Text style={styles.ayuda}>Lo podréis cambiar en Ajustes y en cada gasto.</Text>
        <MensajeError texto={error} />
      </GrupoOpciones>
    </Pantalla>
  );
}

/** Porcentaje de cada uno con −/+ de 5 en 5 (del 5 al 95). Tu parte va en tu color; la de tu pareja, en neutro. */
function ControlPorcentaje({
  pct,
  onCambiar,
  miColor,
}: {
  pct: number;
  onCambiar: (p: number) => void;
  miColor: Paleta['personas'][ColorPersona] | null;
}) {
  const styles = useStyles();
  return (
    <View style={styles.pctFila}>
      <BotonRedondo etiqueta="−" accesible="Bajar tu porcentaje" onPress={() => onCambiar(Math.max(5, pct - PASO_PCT))} />
      <Text style={styles.pctTexto} accessibilityLiveRegion="polite">
        <Text style={[styles.resumenNombre, miColor && { color: miColor.ink }]}>Tú {pct}{'\u00a0'}%</Text>
        {' · '}
        <Text style={styles.resumenNombre}>Tu{'\u00a0'}pareja {100 - pct}{'\u00a0'}%</Text>
      </Text>
      <BotonRedondo etiqueta="+" accesible="Subir tu porcentaje" onPress={() => onCambiar(Math.min(95, pct + PASO_PCT))} />
    </View>
  );
}

function BotonRedondo({ etiqueta, accesible, onPress }: { etiqueta: string; accesible: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accesible}
      onPress={onPress}
      style={({ pressed }) => [styles.redondo, pressed && styles.redondoPulsado]}
    >
      <Text style={styles.redondoTexto}>{etiqueta}</Text>
    </Pressable>
  );
}

const useStyles = crearEstilos((colors) => ({
  dosCampos: { flexDirection: 'row', gap: 12, marginTop: 4 },
  campo: { flex: 1, minWidth: 0 },
  resumen: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  resumenNombre: { fontFamily: fonts.bodyBold, color: colors.text },
  ayuda: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  pctFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pctTexto: { flex: 1, textAlign: 'center', fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  redondo: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  redondoPulsado: { backgroundColor: colors.surface },
  redondoTexto: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.text },
}));
