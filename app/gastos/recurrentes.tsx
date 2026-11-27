import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { BotonSecundario } from '@/components/onboarding/Botones';
import { Segmentado } from '@/components/onboarding/OpcionRadio';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { formatearImporte } from '@/lib/dinero/importe';
import { infoCategoria } from '@/lib/gastos/categorias';
import { personas } from '@/lib/gastos/personas';
import { esPersonal, fechaCobro, importeRecurrente, lineaRecurrente, proximoCobro, totales } from '@/lib/gastos/recurrentes';
import { useRecurrentes } from '@/lib/gastos/useGastos';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/** Pagos recurrentes (mockup Recurrentes, docs/plan-gastos-fase4.md §2). */
export default function Recurrentes() {
  const colors = useColores();
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pareja } = useEstado();
  const consulta = useRecurrentes();
  const [pestana, setPestana] = useState<'compartidos' | 'personales'>('compartidos');
  const { refetch } = consulta;
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const volver = () => (router.canGoBack() ? router.back() : router.replace('/gastos'));
  const cabecera = (
    <View style={[styles.cabecera, { paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={volver} style={styles.redondo}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.titulo}>
        Pagos recurrentes
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Añadir pago recurrente"
        onPress={() => router.push({ pathname: '/gastos/recurrente/nuevo', params: pestana === 'personales' ? { tipo: 'personal', origen: 'gastos' } : { origen: 'gastos' } })}
        style={[styles.redondo, styles.mas]}
      >
        <Ionicons name="add" size={24} color={colors.onAccent} />
      </Pressable>
    </View>
  );

  if (!pareja || consulta.isLoading) {
    return (
      <View style={styles.raiz}>
        {cabecera}
        <CargandoHilo size="large" color={colors.accent} style={{ marginTop: 40 }} />
      </View>
    );
  }
  if (consulta.isError || !consulta.data) {
    return (
      <View style={styles.raiz}>
        {cabecera}
        <View style={styles.contenido}>
          <Text style={styles.vacio}>No se han podido cargar los pagos.</Text>
          <BotonSecundario etiqueta="Reintentar" onPress={() => consulta.refetch()} />
        </View>
      </View>
    );
  }

  const p = personas(pareja, colors);
  const personales = pestana === 'personales';
  const lista = consulta.data.filter((r) => esPersonal(r) === personales);
  const t = totales(lista);
  const proximos = lista
    .map((r) => ({ r, fecha: proximoCobro(r) }))
    .filter((x): x is { r: (typeof lista)[number]; fecha: string } => !!x.fecha)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const proximo = proximos[0];

  return (
    <View style={styles.raiz}>
      {cabecera}
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.resumen}>
          <Text style={styles.total}>
            {formatearImporte(t.mes)} al mes {personales ? 'personales' : 'compartidos'}
          </Text>
          {t.anio > 0 ? <Text style={styles.sub}>y {formatearImporte(t.anio)} al año</Text> : null}
          <Text style={styles.sub}>
            {proximo ? `Próximo cobro: ${proximo.r.name}, ${fechaCobro(proximo.fecha)}` : 'Sin cobros próximos'}
          </Text>
        </View>

        <View style={styles.pestanas}>
          <Segmentado
            etiqueta="Tipo de pago recurrente"
            opciones={[
              { valor: 'compartidos', etiqueta: 'Compartidos' },
              { valor: 'personales', etiqueta: 'Personales' },
            ]}
            valor={pestana}
            onCambiar={(v) => setPestana(v as 'compartidos' | 'personales')}
          />
        </View>

        {lista.length === 0 ? (
          <View style={styles.vacioCaja}>
            <Text style={styles.vacio}>
              {personales
                ? 'Aquí salen los pagos que son solo de uno, como tu gimnasio.'
                : 'Suscripciones, facturas y cuotas que pagáis entre los dos o desde el bote.'}
            </Text>
            <BotonSecundario etiqueta="Añadir pago" onPress={() => router.push({ pathname: '/gastos/recurrente/nuevo', params: pestana === 'personales' ? { tipo: 'personal', origen: 'gastos' } : { origen: 'gastos' } })} />
          </View>
        ) : (
          <View style={styles.lista}>
            {lista.map((r, i) => (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/gastos/recurrente/[id]', params: { id: r.id } })}
                style={({ pressed }) => [styles.fila, i < lista.length - 1 && styles.separador, pressed && { opacity: 0.7 }]}
              >
                <View style={styles.icono}>
                  <Ionicons name={infoCategoria(r.category).icono} size={18} color={colors.icon} />
                </View>
                <View style={styles.textos}>
                  <Text style={styles.nombre} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text style={styles.linea} numberOfLines={1}>
                    {lineaRecurrente(r, p.yo.slot, p.nombrePareja)}
                  </Text>
                  {r.paused ? <Text style={styles.etiqueta}>En pausa</Text> : null}
                  {!r.visible_to_partner ? (
                    <View style={styles.privado}>
                      <Ionicons name="lock-closed-outline" size={12} color={colors.textSecondary} />
                      <Text style={styles.etiqueta}>No visible para {p.nombrePareja}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.importe, r.paused && { color: colors.textSecondary }]}>{importeRecurrente(r)}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.nota}>
          <Ionicons name="notifications-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.notaTexto}>Los avisos antes de cada cobro llegarán cuando ito tenga notificaciones.</Text>
        </View>
      </ScrollView>
    </View>
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
  mas: { backgroundColor: colors.accent, borderColor: colors.accent },
  titulo: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  contenido: { paddingHorizontal: 20, gap: 14, paddingTop: 4 },
  resumen: {
    gap: 4,
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
  },
  total: { fontFamily: fonts.title, fontSize: 26, lineHeight: 32, color: colors.text },
  sub: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
  pestanas: { alignSelf: 'flex-start', minWidth: 260 },
  lista: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl - 4, paddingHorizontal: 14 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 60 },
  separador: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  icono: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  textos: { flex: 1, minWidth: 0, gap: 2 },
  nombre: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  linea: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
  etiqueta: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textSecondary },
  privado: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  importe: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  vacioCaja: { gap: 12, padding: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl - 4 },
  vacio: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  nota: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notaTexto: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
}));
