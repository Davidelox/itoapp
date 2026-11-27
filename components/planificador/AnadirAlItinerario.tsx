import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Hoja } from '@/components/gastos/Hoja';
import { EmojiIcono } from '@/components/mapa/EmojiIcono';
import { BotonSecundario } from '@/components/onboarding/Botones';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { hoyISO } from '@/lib/gastos/fechas';
import { diasDelPlan, textoDia } from '@/lib/planificador/itinerario';
import { textoFechas } from '@/lib/planificador/plan';
import { planesParaItinerario } from '@/lib/planificador/sitios';
import type { PlanLista } from '@/lib/planificador/tipos';
import { usePlanes } from '@/lib/planificador/usePlanificador';

/**
 * «Añadir al itinerario» de la ficha de un sitio: hoja inferior con los planes en curso y próximos y, al elegir uno, los
 * días del plan (así la fecha nunca se sale de su rango). Abre el formulario de evento en modo plan con el sitio elegido.
 * Sin planes en curso ni próximos, no se enseña.
 */
export function AnadirAlItinerario({ sitioId }: { sitioId: string }) {
  const colors = useColores();
  const styles = useStyles();
  const router = useRouter();
  const planes = usePlanes();
  const [abierta, setAbierta] = useState(false);
  const [plan, setPlan] = useState<PlanLista | null>(null);
  const hoy = hoyISO();
  const elegibles = planesParaItinerario(planes.data ?? [], hoy);
  if (elegibles.length === 0) return null;

  const cerrar = () => {
    setAbierta(false);
    setPlan(null);
  };
  const ir = (planId: string, fecha: string) => {
    cerrar();
    router.push({ pathname: '/calendario/nuevo', params: { plan: planId, fecha, sitio: sitioId } });
  };
  const dias = plan ? diasDelPlan(plan.start_date, plan.end_date) : [];

  return (
    <>
      <BotonSecundario etiqueta="Añadir al itinerario" onPress={() => setAbierta(true)} />
      <Hoja visible={abierta} titulo={plan ? '¿Qué día?' : 'Añadir al itinerario de…'} onCerrar={cerrar} desplazable>
        {plan ? (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel="Elegir otro plan" onPress={() => setPlan(null)} style={styles.fila}>
              <Ionicons name="chevron-back" size={20} color={colors.accent} />
              <Text style={styles.volver}>{`${plan.icon} ${plan.name}`}</Text>
            </Pressable>
            {dias.map((fecha, i) => (
              <Pressable
                key={fecha}
                accessibilityRole="button"
                accessibilityLabel={`Añadir al ${textoDia({ fecha, numero: i + 1, elementos: [] }, dias.length).toLowerCase()}`}
                onPress={() => ir(plan.id, fecha)}
                style={styles.opcion}
              >
                <Text style={styles.nombre}>{textoDia({ fecha, numero: i + 1, elementos: [] }, dias.length)}</Text>
              </Pressable>
            ))}
          </>
        ) : (
          elegibles.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={`${p.name}, ${textoFechas(p.start_date, p.end_date, hoy)}`}
              onPress={() => setPlan(p)}
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
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </Pressable>
          ))
        )}
      </Hoja>
    </>
  );
}

const useStyles = crearEstilos((colors) => ({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6 },
  textos: { flex: 1, gap: 1 },
  nombre: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  linea: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  volver: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.accent },
  opcion: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
}));
