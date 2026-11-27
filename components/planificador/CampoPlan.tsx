import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Grupo } from '@/components/gastos/Controles';
import { Hoja } from '@/components/gastos/Hoja';
import { EmojiIcono } from '@/components/mapa/EmojiIcono';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { hoyISO } from '@/lib/gastos/fechas';
import { planesElegibles } from '@/lib/gastos/planes';
import { textoFechas } from '@/lib/planificador/plan';
import type { PlanLista } from '@/lib/planificador/tipos';

/**
 * Fila «Plan (opcional)» del formulario de gasto: abre una hoja con los planes en curso y próximos y la opción «Sin plan».
 */
export function CampoPlan({
  valor,
  planes,
  cargando,
  onCambiar,
}: {
  valor: string | null;
  planes: PlanLista[];
  cargando: boolean;
  onCambiar: (plan: PlanLista | null) => void;
}) {
  const colors = useColores();
  const styles = useStyles();
  const [abierta, setAbierta] = useState(false);
  const hoy = hoyISO();
  const actual = planes.find((p) => p.id === valor) ?? null;
  const elegibles = planesElegibles(planes, hoy, valor);
  const elegir = (plan: PlanLista | null) => {
    onCambiar(plan);
    setAbierta(false);
  };

  return (
    <Grupo etiqueta="Plan (opcional)">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Plan: ${actual ? actual.name : valor ? 'plan no disponible' : 'sin plan'}`}
        accessibilityHint="Abre la lista de planes"
        onPress={() => setAbierta(true)}
        style={styles.boton}
      >
        {actual ? <EmojiIcono emoji={actual.icon} size={20} /> : <Ionicons name="airplane-outline" size={20} color={colors.icon} />}
        <Text style={[styles.botonTexto, !actual && styles.vacio]} numberOfLines={1}>
          {actual ? actual.name : valor ? 'Plan no disponible' : 'Sin plan'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </Pressable>
      <Hoja visible={abierta} titulo="Elegir plan" onCerrar={() => setAbierta(false)} desplazable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sin plan"
          accessibilityState={{ selected: valor === null }}
          onPress={() => elegir(null)}
          style={styles.fila}
        >
          <Ionicons name="close-circle-outline" size={24} color={colors.icon} />
          <Text style={styles.nombre}>Sin plan</Text>
          {valor === null ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
        </Pressable>
        {cargando ? <Text style={styles.ayuda}>Cargando planes…</Text> : null}
        {!cargando && elegibles.length === 0 ? <Text style={styles.ayuda}>No tenéis planes en curso ni próximos.</Text> : null}
        {elegibles.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityLabel={`${p.name}, ${textoFechas(p.start_date, p.end_date, hoy)}`}
            accessibilityState={{ selected: p.id === valor }}
            onPress={() => elegir(p)}
            style={styles.fila}
          >
            <EmojiIcono emoji={p.icon} size={26} />
            <View style={styles.textos}>
              <Text style={styles.nombre} numberOfLines={2}>
                {p.name}
              </Text>
              <Text style={styles.linea} numberOfLines={1}>
                {textoFechas(p.start_date, p.end_date, hoy)}
              </Text>
            </View>
            {p.id === valor ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
          </Pressable>
        ))}
      </Hoja>
    </Grupo>
  );
}

const useStyles = crearEstilos((colors) => ({
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.card,
  },
  botonTexto: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  vacio: { fontFamily: fonts.body, color: colors.textSecondary },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6 },
  textos: { flex: 1, gap: 1 },
  nombre: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  linea: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  ayuda: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, paddingVertical: 8 },
}));
