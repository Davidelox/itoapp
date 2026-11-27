import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { HojaCambio } from '@/components/ajustes/HojaCambio';
import { BarraPorcentaje } from '@/components/gastos/Controles';
import { CampoTexto } from '@/components/onboarding/CampoTexto';
import { GrupoOpciones, OpcionRadio, Segmentado } from '@/components/onboarding/OpcionRadio';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { type FilaAjustes, aplicar, cambiosBote, listaCategorias, ordenarCategorias } from '@/lib/ajustes/ajustes';
import { formatearEuros, leerEuros } from '@/lib/dinero/importe';
import { CATEGORIAS, type Categoria, INFO_CATEGORIA } from '@/lib/gastos/categorias';
import { personas } from '@/lib/gastos/personas';
import { pctDeYo, type RepartoPorDefecto } from '@/lib/gastos/reparto';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

type Props = { actual: FilaAjustes; pareja: Pareja; onCerrar: () => void };

/** Barra de porcentaje vista desde quien mira (en la base de datos siempre se guarda el de m1). */
function Porcentaje({ pctM1, onCambiar, pareja }: { pctM1: number; onCambiar: (pctM1: number) => void; pareja: Pareja }) {
  const colors = useColores();
  const p = personas(pareja, colors);
  const yo = p.yo.slot;
  const fondo = (c: Pareja['yo']['color']) => (c ? colors.personas[c].bg : colors.surface);
  return (
    <BarraPorcentaje
      pctYo={pctDeYo(yo, pctM1)}
      onCambiar={(mio) => onCambiar(yo === 'm1' ? mio : 100 - mio)}
      nombrePareja={p.nombrePareja}
      importeYo={null}
      importePareja={null}
      tintaYo={p.tintaYo}
      tintaPareja={p.tintaPareja}
      fondoYo={fondo(p.yo.color)}
      fondoPareja={fondo(p.otra?.color ?? null)}
    />
  );
}

/** Reparto por defecto de los gastos y su porcentaje. */
export function HojaReparto({ actual, pareja, onCerrar }: Props) {
  const styles = useStyles();
  const [reparto, setReparto] = useState<RepartoPorDefecto>(actual.default_split);
  const [pct, setPct] = useState(actual.proportional_pct_m1);
  const nuevo = aplicar(actual, { default_split: reparto, proportional_pct_m1: pct });
  const opcion = (valor: RepartoPorDefecto, titulo: string, detalle: string, extra?: ReactNode) => (
    <OpcionRadio titulo={titulo} detalle={detalle} elegida={reparto === valor} onElegir={() => setReparto(valor)} extra={extra} />
  );
  return (
    <HojaCambio titulo="Reparto de los gastos" actual={actual} nuevo={nuevo} onCerrar={onCerrar}>
      <Text style={styles.ayuda}>Es lo que sale elegido al apuntar un gasto. En cada gasto se puede cambiar.</Text>
      {actual.pot_enabled ? (
        <>
          {opcion('mixed', 'Mixto', `${listaCategorias(actual.pot_categories)} van al bote; el resto, a medias.`)}
          {opcion('all_pot', 'Todo al bote', 'Todos los gastos salen del bote común.')}
        </>
      ) : null}
      {opcion('half', 'A medias', 'Cada gasto se divide a partes iguales.')}
      {opcion(
        'proportional',
        'Proporcional',
        'Según lo que gana cada uno.',
        <Porcentaje pctM1={pct} onCambiar={setPct} pareja={pareja} />,
      )}
      {!actual.pot_enabled ? <Text style={styles.ayuda}>Mixto y Todo al bote necesitan el bote común.</Text> : null}
    </HojaCambio>
  );
}

/** Qué categorías paga el bote en el reparto Mixto. */
export function HojaCategorias({ actual, onCerrar }: Omit<Props, 'pareja'>) {
  const colors = useColores();
  const styles = useStyles();
  const [elegidas, setElegidas] = useState<Categoria[]>(actual.pot_categories);
  const nuevo = aplicar(actual, { pot_categories: ordenarCategorias(elegidas) });
  const cambiar = (c: Categoria) => setElegidas((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]));
  return (
    <HojaCambio titulo="Categorías del bote" actual={actual} nuevo={nuevo} onCerrar={onCerrar}>
      <Text style={styles.ayuda}>Con el reparto Mixto, estas categorías salen del bote común y el resto se reparte a medias.</Text>
      <View style={styles.lista}>
        {CATEGORIAS.map((c, i) => {
          const del = elegidas.includes(c);
          return (
            <Pressable
              key={c}
              accessibilityRole="switch"
              accessibilityState={{ checked: del }}
              accessibilityLabel={`${INFO_CATEGORIA[c].nombre}: ${del ? 'del bote' : 'a repartir'}`}
              onPress={() => cambiar(c)}
              style={[styles.fila, i < CATEGORIAS.length - 1 && styles.separador]}
            >
              <Ionicons name={INFO_CATEGORIA[c].icono} size={20} color={colors.icon} />
              <Text style={styles.filaNombre}>{INFO_CATEGORIA[c].nombre}</Text>
              <View style={[styles.etiqueta, del ? styles.etiquetaBote : styles.etiquetaRepartir]}>
                <Text style={[styles.etiquetaTexto, del && styles.etiquetaTextoBote]}>{del ? 'Del bote' : 'A repartir'}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </HojaCambio>
  );
}

/** Bote común: sí o no, cómo se rellena (importe y día) y cómo aportáis. */
export function HojaBote({ actual, pareja, onCerrar }: Props) {
  const colors = useColores();
  const styles = useStyles();
  const [activo, setActivo] = useState(actual.pot_enabled);
  const [mensual, setMensual] = useState(actual.pot_funding === 'monthly');
  const [importe, setImporte] = useState(actual.pot_monthly_cents ? String(actual.pot_monthly_cents / 100).replace('.', ',') : '');
  const [dia, setDia] = useState(actual.pot_day ? String(actual.pot_day) : '1');
  const [aporte, setAporte] = useState<'half' | 'proportional'>(actual.pot_pct_m1 === 50 ? 'half' : 'proportional');
  const [pct, setPct] = useState(actual.pot_pct_m1 === 50 ? actual.proportional_pct_m1 : actual.pot_pct_m1);

  const cents = leerEuros(importe);
  const diaNum = /^\d{1,2}$/.test(dia) ? Number(dia) : NaN;
  const diaValido = diaNum >= 1 && diaNum <= 31;
  const pctM1 = aporte === 'half' ? 50 : pct;
  const cambios = cambiosBote(actual, {
    activo,
    mensual,
    aportacionCents: cents,
    dia: diaValido ? diaNum : null,
    pctM1,
  });
  const nuevo = aplicar(actual, cambios);
  const p = personas(pareja, colors);
  const mio = pctDeYo(p.yo.slot, pctM1);

  return (
    <HojaCambio titulo="Bote común" actual={actual} nuevo={nuevo} onCerrar={onCerrar}>
      <Segmentado
        etiqueta="¿Tenéis un bote común?"
        opciones={[
          { valor: 'si', etiqueta: 'Sí' },
          { valor: 'no', etiqueta: 'No' },
        ]}
        valor={activo ? 'si' : 'no'}
        onCambiar={(v) => setActivo(v === 'si')}
      />
      {!activo ? (
        <Text style={styles.ayuda}>
          {actual.pot_enabled
            ? `El saldo y lo que el bote os deba no desaparecen: podréis seguir reembolsándolo.${
                actual.default_split === 'mixed' || actual.default_split === 'all_pot'
                  ? ' El reparto por defecto pasará a A medias.'
                  : ''
              }`
            : 'El bote común es un saldo compartido que se va rellenando y del que salen los gastos de casa.'}
        </Text>
      ) : (
        <>
          <GrupoOpciones pregunta="¿Cómo se rellena?">
            <OpcionRadio
              titulo="Aportación fija cada mes"
              detalle="Se suma sola al bote el día que elijáis."
              elegida={mensual}
              onElegir={() => setMensual(true)}
            />
            <OpcionRadio titulo="A mano" detalle="Cada uno añade dinero cuando quiera." elegida={!mensual} onElegir={() => setMensual(false)} />
            {mensual ? (
              <View style={styles.dosCampos}>
                <View style={styles.campo}>
                  <CampoTexto
                    etiqueta="Importe al mes (€)"
                    value={importe}
                    onChangeText={setImporte}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    error={importe.trim() !== '' && cents === null ? 'Escribe un importe, por ejemplo 1.000.' : null}
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
                    error={dia.trim() !== '' && !diaValido ? 'Un día del 1 al 31.' : null}
                    ayuda={diaValido && diaNum >= 29 ? 'Si el mes es más corto, el último día.' : undefined}
                  />
                </View>
              </View>
            ) : null}
            {mensual && (!actual.pot_enabled || actual.pot_funding !== 'monthly') ? (
              <Text style={styles.ayuda}>Empieza a contar desde hoy: no se crean aportaciones de meses anteriores.</Text>
            ) : null}
          </GrupoOpciones>

          <GrupoOpciones pregunta="¿Cuánto pone cada uno?">
            <OpcionRadio titulo="A medias" detalle="Cada uno pone la mitad." elegida={aporte === 'half'} onElegir={() => setAporte('half')} />
            <OpcionRadio
              titulo="Proporcional"
              detalle="Según lo que gana cada uno."
              elegida={aporte === 'proportional'}
              onElegir={() => setAporte('proportional')}
              extra={<Porcentaje pctM1={pct} onCambiar={setPct} pareja={pareja} />}
            />
            {mensual && cents !== null ? (
              <Text style={styles.ayuda}>
                Cada mes: tú {formatearEuros(Math.round((cents * mio) / 100))} · {p.nombrePareja}{' '}
                {formatearEuros(cents - Math.round((cents * mio) / 100))}
              </Text>
            ) : null}
          </GrupoOpciones>
        </>
      )}
    </HojaCambio>
  );
}

const useStyles = crearEstilos((colors) => ({
  ayuda: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  dosCampos: { flexDirection: 'row', gap: 12, marginTop: 4 },
  campo: { flex: 1, minWidth: 0 },
  lista: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl - 4, paddingHorizontal: 14 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  separador: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  filaNombre: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  etiqueta: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.full },
  etiquetaBote: { backgroundColor: colors.text },
  etiquetaRepartir: { backgroundColor: colors.surface },
  etiquetaTexto: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
  etiquetaTextoBote: { color: colors.onAccent },
}));
