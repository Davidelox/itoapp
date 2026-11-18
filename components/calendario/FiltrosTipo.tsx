import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/gastos/Controles';
import type { Filtro } from '@/lib/calendario/agrupar';
import type { IconoCalendario } from '@/lib/calendario/evento';

const OPCIONES: { valor: Filtro; etiqueta: string; icono?: IconoCalendario }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'event', etiqueta: 'Eventos' },
  { valor: 'trip', etiqueta: 'Viajes', icono: 'airplane-outline' },
  { valor: 'eating_out', etiqueta: 'Comer fuera', icono: 'restaurant-outline' },
  { valor: 'leisure', etiqueta: 'Ocio', icono: 'ticket-outline' },
  { valor: 'birthday', etiqueta: 'Cumpleaños', icono: 'gift-outline' },
  { valor: 'payment', etiqueta: 'Pagos', icono: 'card-outline' },
];

/**
 * Todos · Eventos · Viajes · Comer fuera · Ocio · Cumpleaños · Pagos, uno a la vez, en una fila con scroll
 * horizontal. «Eventos» son todos los eventos menos los cumpleaños. «Planes» llegará con el Planificador.
 */
export function FiltrosTipo({ valor, onCambiar }: { valor: Filtro; onCambiar: (f: Filtro) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel="Filtrar por tipo"
      // Llega hasta los bordes de la pantalla (el contenido de la pestaña lleva 20 px a cada lado).
      style={styles.scroll}
      contentContainerStyle={styles.fila}
    >
      {OPCIONES.map((o) => (
        <Chip key={o.valor} rol="radio" etiqueta={o.etiqueta} icono={o.icono} activo={o.valor === valor} onPress={() => onCambiar(o.valor)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { marginHorizontal: -20, flexGrow: 0 },
  fila: { flexDirection: 'row', gap: 6, paddingHorizontal: 20 },
});
