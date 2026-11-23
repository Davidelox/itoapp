import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { FormularioEvento, type TipoFormulario } from '@/components/calendario/FormularioEvento';
import { colors, fonts } from '@/constants/theme';
import type { CategoriaEvento } from '@/lib/calendario/evento';
import { aISO, deISO, hoyISO } from '@/lib/gastos/fechas';
import { sitioDeParametro, sitioInicialVisible } from '@/lib/mapa/conexiones';
import { useSitios } from '@/lib/mapa/useSitios';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { fechaInicialEnPlan, planDeParametro } from '@/lib/planificador/itinerario';
import { usePlan } from '@/lib/planificador/usePlanificador';

const TIPOS: TipoFormulario[] = ['evento', 'cumple', 'pago'];
const CATEGORIAS: CategoriaEvento[] = ['trip', 'eating_out', 'leisure', 'sports', 'home_night', 'culture', 'social', 'health'];

/**
 * Nuevo evento. `?fecha=YYYY-MM-DD` precarga el día (el seleccionado en el calendario, también si ya pasó);
 * `?tipo=evento|cumple|pago` y `?categoria=<categoría de evento>` los sugiere el filtro activo del calendario;
 * `?sitio=<id>` precarga el sitio del Mapa («Planear aquí»); `?plan=<uuid>` con `?fecha=` crea un elemento del itinerario
 * de ese plan (la fecha se limita a las del plan).
 */
export default function NuevoEvento() {
  const { pareja } = useEstado();
  const { fecha, tipo, categoria, sitio, plan: planParam } = useLocalSearchParams<{ fecha?: string; tipo?: string; categoria?: string; sitio?: string; plan?: string }>();
  const planId = planDeParametro(planParam);
  const { plan, isLoading } = usePlan(planId ?? undefined);
  const sitios = useSitios();
  const sitioId = sitioDeParametro(sitio);
  if (!pareja || (planId && isLoading) || (sitioId && sitios.isLoading)) {
    return (
      <View style={styles.cargando}>
        <CargandoHilo size="large" color={colors.accent} />
      </View>
    );
  }
  if (planParam && (!planId || !plan)) {
    return (
      <View style={styles.cargando}>
        <Text style={styles.texto}>Este plan ya no existe.</Text>
      </View>
    );
  }
  const valida = !!fecha && aISO(deISO(fecha)) === fecha;
  return (
    <FormularioEvento
      pareja={pareja}
      plan={plan}
      fechaInicial={plan ? fechaInicialEnPlan(fecha, plan.start_date, plan.end_date) : valida ? fecha : hoyISO()}
      tipoInicial={TIPOS.find((t) => t === tipo)}
      categoriaInicial={CATEGORIAS.find((c) => c === categoria)}
      sitioInicial={sitioInicialVisible(sitios.data, sitioId)}
    />
  );
}

const styles = StyleSheet.create({
  cargando: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  texto: { fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary },
});
