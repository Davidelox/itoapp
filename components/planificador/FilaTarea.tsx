import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/theme';
import { etiquetaMarcar, etiquetaTarea, lineaTarea } from '@/lib/planificador/tareas';
import type { Tarea } from '@/lib/planificador/tipos';

/**
 * Una tarea (mockup DetalleProyecto): casilla redonda de 44 px, título, «Asignada · Tú» / «Hecho por María» con el nombre
 * en su tinta y, en una reserva pendiente sin sitio, «Elegir sitio». El cuerpo abre la hoja de edición.
 */
export function FilaTarea({
  tarea,
  yo,
  nombrePareja,
  tintaYo,
  tintaPareja,
  sitio,
  elemento,
  ocupada,
  onMarcar,
  onAbrir,
}: {
  tarea: Tarea;
  yo: { slot: 'm1' | 'm2'; userId: string };
  nombrePareja: string;
  tintaYo: string;
  tintaPareja: string;
  /** Nombre del sitio enlazado, si lo hay. */
  sitio: string | null;
  /** Línea de la reserva enlazada a un elemento del itinerario: «Reserva · Cena en El Olivo · Sáb 5, 21:30». */
  elemento: string | null;
  ocupada: boolean;
  onMarcar: () => void;
  onAbrir: () => void;
}) {
  const hecha = tarea.status === 'done';
  const l = lineaTarea(tarea, yo, nombrePareja);
  const tinta = l.de === 'yo' ? tintaYo : tintaPareja;
  const elegirSitio = tarea.kind === 'booking' && !hecha && !tarea.place_id;
  return (
    <View style={styles.fila}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={etiquetaMarcar(tarea)}
        accessibilityState={{ checked: hecha, disabled: ocupada }}
        disabled={ocupada}
        onPress={onMarcar}
        style={styles.toque}
      >
        <View style={[styles.casilla, hecha && styles.casillaHecha]}>{hecha ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}</View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={etiquetaTarea(tarea, yo, nombrePareja, elemento)} accessibilityHint="Abre la tarea para editarla" onPress={onAbrir} style={styles.cuerpo}>
        <Text style={[styles.titulo, hecha && styles.tachado]}>{tarea.title}</Text>
        <Text style={styles.linea}>
          {l.prefijo}
          {l.nombre ? <Text style={{ color: tinta, fontFamily: fonts.bodyBold }}>{l.nombre}</Text> : null}
          {l.fecha ? ` · ${l.fecha}` : ''}
          {sitio ? ` · ${sitio}` : ''}
        </Text>
        {elemento ? <Text style={styles.linea}>{elemento}</Text> : null}
      </Pressable>
      {elegirSitio ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Elegir sitio: ${tarea.title}`} onPress={onAbrir} style={styles.pildora}>
          <Text style={styles.pildoraTexto}>Elegir sitio</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 52 },
  toque: { width: 44, height: 44, marginLeft: -6, alignItems: 'center', justifyContent: 'center' },
  casilla: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' },
  casillaHecha: { backgroundColor: colors.accent, borderColor: colors.accent },
  cuerpo: { flex: 1, minHeight: 44, justifyContent: 'center', gap: 2 },
  titulo: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  tachado: { textDecorationLine: 'line-through', color: colors.textSecondary },
  linea: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  pildora: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  pildoraTexto: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.accent },
});
