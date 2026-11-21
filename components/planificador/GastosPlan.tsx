import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FilaGasto } from '@/components/gastos/FilaGasto';
import { HojaSaldar } from '@/components/gastos/HojaSaldar';
import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { colors, fonts, radius } from '@/constants/theme';
import { formatearImporte } from '@/lib/dinero/importe';
import { fraseSaldoPlan, leyendaPlan, pendienteDeConfirmarDelPlan, saldablesDelPlan, totalGastadoDelPlan } from '@/lib/gastos/planes';
import { personas } from '@/lib/gastos/personas';
import { totalDe } from '@/lib/gastos/saldar';
import { textoSaldo } from '@/lib/gastos/textoSaldo';
import { useAbiertos, useGastosPlan } from '@/lib/gastos/useGastos';
import type { Pareja } from '@/lib/pareja/EstadoProvider';
import type { PlanLista } from '@/lib/planificador/tipos';

/**
 * «Gastos del plan» (mockup DetalleProyecto): la lista, la leyenda de que el plan cuenta como un único gasto, el saldo del plan
 * («Debes 17,50 € a María», «Saldar solo esto») y «Añadir gasto al plan». El saldo es parte del saldo global: no hay otro guardado.
 */
export function GastosPlan({ plan, pareja }: { plan: PlanLista; pareja: Pareja }) {
  const router = useRouter();
  const gastos = useGastosPlan(plan.id);
  const abiertos = useAbiertos();
  const [saldando, setSaldando] = useState(false);
  const p = personas(pareja);
  const yo = p.yo.slot;
  const lista = gastos.data ?? [];

  const saldables = abiertos.data ? saldablesDelPlan(yo, plan.id, abiertos.data.gastos, abiertos.data.pendientesDeBorrar) : [];
  const neto = totalDe(yo, saldables);
  const texto = textoSaldo(neto, !!p.otra);
  const porConfirmar = pendienteDeConfirmarDelPlan(yo, plan.id, lista);
  const nombre = <Text style={[styles.nombre, { color: p.tintaPareja }]}>{p.nombrePareja}</Text>;

  return (
    <View style={styles.seccion}>
      <Text accessibilityRole="header" style={styles.titulo}>
        Gastos del plan
      </Text>
      {gastos.isLoading ? (
        <Text style={styles.ayuda}>Cargando gastos…</Text>
      ) : gastos.isError ? (
        <View style={styles.error}>
          <Text style={styles.ayuda}>No se han podido cargar los gastos.</Text>
          <Pressable accessibilityRole="button" onPress={() => gastos.refetch()} style={styles.reintentar}>
            <Text style={styles.reintentarTexto}>Reintentar</Text>
          </Pressable>
        </View>
      ) : lista.length === 0 ? (
        <Text style={styles.ayuda}>Aún no hay gastos en este plan.</Text>
      ) : (
        <>
          <View>
            {lista.map((g, i) => (
              <FilaGasto
                key={g.id}
                gasto={g}
                pareja={pareja}
                conFecha
                ocultarPlan
                separador={i < lista.length - 1}
                onPress={() => router.push({ pathname: '/gastos/[id]', params: { id: g.id } })}
              />
            ))}
          </View>
          <Text style={styles.ayuda}>{leyendaPlan(totalGastadoDelPlan(lista))}</Text>
          {abiertos.data ? (
            <View style={styles.saldo} accessible accessibilityLabel={`${fraseSaldoPlan(neto, p.nombrePareja, !!p.otra)}. Incluido en vuestro saldo.`}>
              <View style={styles.saldoFila}>
                {p.otra ? <AvatarPersona nombre={p.nombrePareja} color={p.otra.color} avatarPath={p.otra.avatarPath} tamano={40} /> : null}
                <View style={styles.saldoTextos}>
                  {texto.tipo === 'teDebe' ? (
                    <Text style={styles.saldoFrase}>
                      {nombre} te debe <Text style={styles.importe}>{formatearImporte(texto.cents)}</Text>
                    </Text>
                  ) : texto.tipo === 'debes' ? (
                    <Text style={styles.saldoFrase}>
                      Debes <Text style={styles.importe}>{formatearImporte(texto.cents)}</Text> a {nombre}
                    </Text>
                  ) : (
                    <Text style={styles.saldoFrase}>En paz</Text>
                  )}
                  <Text style={styles.saldoAyuda}>Incluido en vuestro saldo</Text>
                </View>
              </View>
              {porConfirmar !== 0 ? <Text style={styles.saldoAyuda}>{formatearImporte(Math.abs(porConfirmar))} pendientes de confirmar</Text> : null}
              {saldables.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Saldar solo esto"
                  accessibilityHint="Salda solo los gastos de este plan"
                  onPress={() => setSaldando(true)}
                  style={({ pressed }) => [styles.saldar, pressed && { backgroundColor: colors.accentDark }]}
                >
                  <Text style={styles.saldarTexto}>Saldar solo esto</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Añadir gasto al plan"
        onPress={() => router.push({ pathname: '/gastos/nuevo', params: { plan: plan.id } })}
        style={({ pressed }) => [styles.anadir, pressed && { backgroundColor: colors.surface }]}
      >
        <Text style={styles.anadirTexto}>Añadir gasto al plan</Text>
      </Pressable>
      {saldando ? <HojaSaldar plan={{ id: plan.id, nombre: plan.name }} onCerrar={() => setSaldando(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  seccion: { gap: 12, padding: 16, borderRadius: radius.xl - 4, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  titulo: { fontFamily: fonts.title, fontSize: 18, color: colors.text },
  ayuda: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  error: { gap: 4 },
  reintentar: { minHeight: 44, justifyContent: 'center' },
  reintentarTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.accent },
  saldo: { gap: 10, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface },
  saldoFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  saldoTextos: { flex: 1, gap: 2 },
  saldoFrase: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.text },
  nombre: { fontFamily: fonts.bodyBold },
  importe: { fontFamily: fonts.title, fontSize: 20, color: colors.text },
  saldoAyuda: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  saldar: { minHeight: 44, borderRadius: radius.full, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saldarTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.white },
  anadir: { height: 48, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.text, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  anadirTexto: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
});
