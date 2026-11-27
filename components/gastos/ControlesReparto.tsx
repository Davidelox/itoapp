import { Ionicons } from '@expo/vector-icons';
import { Pressable, Switch, Text, View } from 'react-native';

import { BarraPorcentaje, Chip, FilaChips, Grupo } from '@/components/gastos/Controles';
import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { formatearImporte } from '@/lib/dinero/importe';
import { personas } from '@/lib/gastos/personas';
import {
  type Pagador,
  type Reparto,
  aDatos,
  fraseResultado,
  partes,
  partesDeYo,
  pctDeYo,
} from '@/lib/gastos/reparto';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

type Props = {
  pareja: Pareja;
  /** Importe escrito, en céntimos (null si aún no hay uno válido): alimenta los importes y el resultado. */
  cents: number | null;
  pagador: Pagador;
  onPagador: (v: Pagador) => void;
  reparto: Reparto;
  onReparto: (v: Reparto) => void;
  pctYo: number;
  onPctYo: (pct: number) => void;
  /** % de m1 de «Proporcional» según los ajustes (o el que ya tenía el gasto). */
  pctProporcionalM1: number;
  /** Oculta el chip «Proporcional» (es igual que «A medias» cuando el % es 50). */
  sinProporcional: boolean;
  /** Ofrece el bote: está activo, o el gasto que se edita ya lo usa. */
  conBote: boolean;
  /** Gasto ya saldado: el pagador y el reparto no se pueden cambiar. */
  saldado?: boolean;
  visible: boolean;
  onVisible: (v: boolean) => void;
  /** Enseña «Visible para {Pareja}»: solo si el gasto puede ser privado y lo crea quien mira. */
  mostrarVisible: boolean;
};

/**
 * «¿Quién pagó?», «¿De quién es el gasto?», % personalizado, resultado y «Visible para {Pareja}»: los mismos
 * controles en «Nuevo gasto» (FormularioGasto) y en la hoja «¿Quién pagó?» de un evento (HojaQuienPago).
 * No guarda nada: el estado vive en quien lo usa.
 */
export function ControlesReparto({
  pareja,
  cents,
  pagador,
  onPagador,
  reparto,
  onReparto,
  pctYo,
  onPctYo,
  pctProporcionalM1,
  sinProporcional,
  conBote,
  saldado = false,
  visible,
  onVisible,
  mostrarVisible,
}: Props) {
  const colors = useColores();
  const styles = useStyles();
  const p = personas(pareja, colors);
  const yo = p.yo.slot;
  const datos = aDatos(yo, pagador, reparto, pctYo, pctProporcionalM1);
  const vista = partes(cents ?? 0, datos.split_mode, datos.split_pct_m1);
  const mias = partesDeYo(yo, vista);
  const resultado = fraseResultado(yo, datos.paid_by, vista, p.nombrePareja, 'futuro');

  const pctProporcionalYo = pctDeYo(yo, pctProporcionalM1);
  const opcionesReparto: { valor: Reparto; etiqueta: string }[] = [
    { valor: 'medias', etiqueta: 'A medias' },
    ...(sinProporcional
      ? []
      : [{ valor: 'proporcional' as const, etiqueta: `Proporcional ${pctProporcionalYo}/${100 - pctProporcionalYo}` }]),
    { valor: 'personalizado', etiqueta: 'Personalizado' },
    { valor: 'solo_yo', etiqueta: 'Solo tú' },
    { valor: 'solo_pareja', etiqueta: `Solo ${p.nombrePareja}` },
    ...(conBote ? [{ valor: 'bote' as const, etiqueta: 'Del bote' }] : []),
  ];

  const pagadores = [
    { valor: 'yo' as const, etiqueta: 'Tú', miembro: p.yo, tinta: p.tintaYo },
    { valor: 'pareja' as const, etiqueta: p.nombrePareja, miembro: p.otra, tinta: p.tintaPareja },
    ...(conBote ? [{ valor: 'bote' as const, etiqueta: 'Bote común', miembro: null, tinta: colors.text }] : []),
  ];

  return (
    <>
      <Grupo etiqueta="¿Quién pagó?" rol="radiogroup">
        <View style={styles.pagadores}>
          {pagadores.map((o) => {
            const activo = pagador === o.valor;
            return (
              <Pressable
                key={o.valor}
                accessibilityRole="radio"
                accessibilityState={{ checked: activo, disabled: saldado }}
                accessibilityLabel={o.etiqueta}
                disabled={saldado}
                onPress={() => onPagador(o.valor)}
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

      <Grupo etiqueta="¿De quién es el gasto?" rol="radiogroup">
        <FilaChips>
          {opcionesReparto.map((o) => (
            <Chip
              key={o.valor}
              rol="radio"
              etiqueta={o.etiqueta}
              activo={reparto === o.valor}
              onPress={() => (saldado ? undefined : onReparto(o.valor))}
            />
          ))}
        </FilaChips>
      </Grupo>

      {reparto === 'personalizado' && !saldado ? (
        <BarraPorcentaje
          pctYo={pctYo}
          onCambiar={onPctYo}
          nombrePareja={p.nombrePareja}
          importeYo={cents !== null ? formatearImporte(mias.yo) : null}
          importePareja={cents !== null ? formatearImporte(mias.pareja) : null}
          tintaYo={p.tintaYo}
          tintaPareja={p.tintaPareja}
          fondoYo={p.yo.color ? colors.personas[p.yo.color].bg : colors.surface}
          fondoPareja={p.otra?.color ? colors.personas[p.otra.color].bg : colors.divider}
        />
      ) : null}

      <View style={styles.resultado} accessible accessibilityLiveRegion="polite">
        <View style={styles.resultadoIcono}>
          {resultado.quien === 'bote' ? (
            <Ionicons name="server-outline" size={16} color={colors.icon} />
          ) : resultado.quien === 'pareja' ? (
            <AvatarPersona nombre={p.nombrePareja} color={p.otra?.color ?? null} avatarPath={p.otra?.avatarPath} tamano={28} />
          ) : (
            <Text style={styles.resultadoGuion}>–</Text>
          )}
        </View>
        <Text style={styles.resultadoTexto}>{resultado.texto}</Text>
      </View>

      {mostrarVisible ? (
        <View style={styles.visible}>
          <View style={styles.visibleTextos}>
            <Text style={styles.visibleTitulo}>Visible para {p.nombrePareja}</Text>
            <Text style={styles.visibleAyuda}>{visible ? `${p.nombrePareja} verá este gasto` : 'Solo lo verás tú'}</Text>
          </View>
          <Switch
            accessibilityLabel={`Visible para ${p.nombrePareja}`}
            value={visible}
            onValueChange={onVisible}
            trackColor={{ true: colors.accent, false: colors.switchOff }}
            thumbColor={colors.thumb}
            // En web la bolita usa activeThumbColor (react-native-web); en nativo basta thumbColor.
            {...{ activeThumbColor: colors.thumb }}
          />
        </View>
      ) : null}
    </>
  );
}

const useStyles = crearEstilos((colors) => ({
  pagadores: { flexDirection: 'row', gap: 8 },
  pagador: {
    flex: 1,
    minWidth: 0,
    minHeight: 68,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  pagadorNormal: { borderWidth: 1, borderColor: colors.inputBorder, margin: 1 },
  pagadorActivo: { borderWidth: 2, borderColor: colors.text },
  pagadorTexto: { fontFamily: fonts.bodyBold, fontSize: 13 },
  boteIcono: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  resultado: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  resultadoIcono: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  resultadoGuion: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.icon },
  resultadoTexto: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 21, color: colors.text },
  visible: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  visibleTextos: { flex: 1, gap: 1 },
  visibleTitulo: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  visibleAyuda: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
}));
