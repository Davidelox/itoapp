import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { colors, fonts, radius } from '@/constants/theme';
import { formatearImporte } from '@/lib/dinero/importe';
import type { Saldo } from '@/lib/gastos/consultas';
import { proximaAportacion } from '@/lib/gastos/bote';
import { fechaCorta } from '@/lib/gastos/fechas';
import { personas } from '@/lib/gastos/personas';
import { useAjustesBote } from '@/lib/gastos/useGastos';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

/**
 * Saldo global (get_balance), con los tres estados de la revisión M3: te debe, debes y estáis en paz.
 * «Saldar» llega en la fase 2.
 */
export function TarjetaSaldo({ saldo, pareja, onSaldar }: { saldo: Saldo | null; pareja: Pareja; onSaldar?: () => void }) {
  const p = personas(pareja);
  const neto = saldo?.partner_owes_me_cents ?? 0;
  const pendiente = saldo?.awaiting_confirmation_cents ?? 0;

  let cabecera: React.ReactNode;
  let importe: string | null = null;
  if (!p.otra && neto === 0) {
    cabecera = (
      <Text style={styles.cabecera}>
        Cuando <Text style={styles.nombre}>tu pareja</Text> se una, aquí veréis quién debe a quién.
      </Text>
    );
  } else if (neto > 0) {
    cabecera = (
      <Text style={styles.cabecera}>
        <Text style={[styles.nombre, { color: p.tintaPareja }]}>{p.nombrePareja}</Text> te debe
      </Text>
    );
    importe = formatearImporte(neto);
  } else if (neto < 0) {
    cabecera = (
      <Text style={styles.cabecera}>
        Debes a <Text style={[styles.nombre, { color: p.tintaPareja }]}>{p.nombrePareja}</Text>
      </Text>
    );
    importe = formatearImporte(-neto);
  } else {
    cabecera = (
      <Text style={styles.cabecera}>
        Saldo con <Text style={[styles.nombre, { color: p.tintaPareja }]}>{p.nombrePareja}</Text>
      </Text>
    );
  }

  // Saldar solo si queda algo sin confirmar (lo pendiente de confirmar ya está en un pago).
  const sinPago = neto - pendiente;
  return (
    <View style={styles.tarjeta}>
      <View style={styles.fila}>
        {p.otra ? <AvatarPersona nombre={p.nombrePareja} color={p.otra.color} avatarPath={p.otra.avatarPath} tamano={28} /> : null}
        <View style={styles.textos}>{cabecera}</View>
      </View>
      <View style={styles.filaImporte}>
        {p.otra || neto !== 0 ? <Text style={styles.importe}>{importe ?? 'Estáis en paz'}</Text> : <View />}
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
    </View>
  );
}

/** Bote común en Gastos (mockup Dinero): saldo, próxima aportación y lo que el bote te debe. Abre la pantalla del bote. */
export function TarjetaBote({ saldo, onAbrir }: { saldo: Saldo; onAbrir: () => void }) {
  const ajustes = useAjustesBote();
  const proxima = ajustes.data ? proximaAportacion(ajustes.data) : null;
  const linea =
    saldo.pot_owes_me_cents > 0
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
        <Text style={styles.aportarTexto}>Aportar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 4,
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  textos: { flex: 1 },
  cabecera: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  nombre: { fontFamily: fonts.bodyBold, color: colors.text },
  importe: { flexShrink: 1, fontFamily: fonts.title, fontSize: 36, lineHeight: 42, color: colors.text },
  filaImporte: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  saldar: { minHeight: 44, paddingHorizontal: 22, borderRadius: radius.full, backgroundColor: colors.accent, justifyContent: 'center' },
  saldarTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.white },
  pendiente: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  bote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
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
});
