import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { formatearImporte } from '@/lib/dinero/importe';
import type { Saldo } from '@/lib/gastos/consultas';
import { proximaAportacion } from '@/lib/gastos/bote';
import { fechaCorta } from '@/lib/gastos/fechas';
import { personas } from '@/lib/gastos/personas';
import { textoSaldo } from '@/lib/gastos/textoSaldo';
import { useAjustesBote } from '@/lib/gastos/useGastos';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

/**
 * Saldo global (get_balance), con los tres estados de la revisión M3: te debe, debes y estáis en paz. Misma tarjeta en
 * Inicio y Gastos; `bote` (Inicio) añade abajo «Bote común · importe», que abre el bote.
 */
export function TarjetaSaldo({
  saldo,
  pareja,
  onSaldar,
  bote,
}: {
  saldo: Saldo | null;
  pareja: Pareja;
  onSaldar?: () => void;
  bote?: { cents: number; onAbrir: () => void };
}) {
  const colors = useColores();
  const styles = useStyles();
  const p = personas(pareja, colors);
  const neto = saldo?.partner_owes_me_cents ?? 0;
  const pendiente = saldo?.awaiting_confirmation_cents ?? 0;
  const texto = textoSaldo(neto, !!p.otra);
  const nombre = <Text style={[styles.nombre, { color: p.tintaPareja }]}>{p.nombrePareja}</Text>;

  let cabecera: React.ReactNode;
  if (texto.tipo === 'sinPareja') {
    cabecera = (
      <Text style={styles.cabecera}>
        Cuando <Text style={styles.nombre}>tu pareja</Text> se una, aquí veréis quién debe a quién.
      </Text>
    );
  } else if (texto.tipo === 'teDebe') {
    cabecera = <Text style={styles.cabecera}>{nombre} te debe</Text>;
  } else if (texto.tipo === 'debes') {
    cabecera = <Text style={styles.cabecera}>Debes a {nombre}</Text>;
  } else {
    cabecera = <Text style={styles.cabecera}>Saldo con {nombre}</Text>;
  }
  const importe = texto.tipo === 'teDebe' || texto.tipo === 'debes' ? formatearImporte(texto.cents) : texto.tipo === 'enPaz' ? 'Estáis en paz' : null;

  // Saldar solo si queda algo sin confirmar (lo pendiente de confirmar ya está en un pago).
  const sinPago = neto - pendiente;
  return (
    <View style={styles.tarjeta}>
      <View style={styles.fila}>
        {p.otra ? <AvatarPersona nombre={p.nombrePareja} color={p.otra.color} avatarPath={p.otra.avatarPath} tamano={44} /> : null}
        <View style={styles.textos}>
          {cabecera}
          {importe ? <Text style={styles.importe}>{importe}</Text> : null}
        </View>
        {onSaldar && (sinPago !== 0 || (saldo?.open_items ?? 0) > 0) ? (
          <Pressable
            accessibilityRole="button"
            onPress={onSaldar}
            style={({ pressed }) => [styles.saldar, pressed && { backgroundColor: colors.accentDark }]}
          >
            <Text style={styles.saldarTexto}>Saldar</Text>
          </Pressable>
        ) : null}
      </View>
      {pendiente !== 0 ? (
        <Text style={styles.pendiente}>{formatearImporte(Math.abs(pendiente))} pendientes de confirmar</Text>
      ) : null}
      {bote ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Bote común, ${formatearImporte(bote.cents)}`}
          onPress={bote.onAbrir}
          style={styles.boteFila}
        >
          <Text style={styles.boteFilaTexto}>
            Bote común · <Text style={styles.boteFilaImporte}>{formatearImporte(bote.cents)}</Text>
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Bote común en Gastos (mockup Dinero): saldo, próxima aportación y lo que el bote te debe. Abre la pantalla del bote. */
export function TarjetaBote({ saldo, onAbrir }: { saldo: Saldo; onAbrir: () => void }) {
  const colors = useColores();
  const styles = useStyles();
  const ajustes = useAjustesBote();
  const proxima = ajustes.data ? proximaAportacion(ajustes.data) : null;
  const desactivado = !saldo.pot_enabled;
  const linea = desactivado
    ? 'Desactivado · queda por cuadrar'
    : saldo.pot_owes_me_cents > 0
      ? `El bote te debe ${formatearImporte(saldo.pot_owes_me_cents)}`
      : proxima && ajustes.data?.aportacionCents
        ? `Próxima aportación: ${fechaCorta(proxima).toLowerCase()} · ${formatearImporte(ajustes.data.aportacionCents)}`
        : null;
  return (
    <View style={styles.bote}>
      <Pressable accessibilityRole="button" onPress={onAbrir} style={styles.boteCuerpo}>
        <Text style={styles.boteTitulo}>BOTE COMÚN</Text>
        <Text style={styles.boteSaldo}>Saldo {formatearImporte(saldo.pot_balance_cents)}</Text>
        {linea ? <Text style={styles.boteLinea}>{linea}</Text> : null}
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onAbrir} style={({ pressed }) => [styles.aportar, pressed && { backgroundColor: colors.segmented }]}>
        <Text style={styles.aportarTexto}>{desactivado ? 'Ver' : 'Aportar'}</Text>
      </Pressable>
    </View>
  );
}

const useStyles = crearEstilos((colors) => ({
  tarjeta: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 16,
    gap: 8,
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textos: { flex: 1, minWidth: 0 },
  cabecera: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  nombre: { fontFamily: fonts.bodyBold, color: colors.text },
  importe: { fontFamily: fonts.title, fontSize: 30, lineHeight: 36, color: colors.text },
  saldar: { minHeight: 44, paddingHorizontal: 22, borderRadius: radius.full, backgroundColor: colors.accent, justifyContent: 'center' },
  boteFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, marginBottom: -6, borderTopWidth: 1, borderTopColor: colors.divider },
  boteFilaTexto: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
  boteFilaImporte: { fontFamily: fonts.bodyBold, color: colors.text },
  saldarTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.onAccent },
  pendiente: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  bote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl - 4,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 14,
  },
  boteCuerpo: { flex: 1, minWidth: 0, gap: 2 },
  boteLinea: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  aportar: { minHeight: 44, paddingHorizontal: 18, borderRadius: radius.full, backgroundColor: colors.surface, justifyContent: 'center' },
  aportarTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  boteTitulo: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.textSecondary },
  boteSaldo: { fontFamily: fonts.title, fontSize: 24, color: colors.text },
}));
