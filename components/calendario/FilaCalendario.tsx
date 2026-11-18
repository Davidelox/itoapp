import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Marcador } from '@/components/calendario/Marcador';
import { colors, fonts, radius } from '@/constants/theme';
import type { Elemento } from '@/lib/calendario/agrupar';
import type { MarcadorSpec } from '@/lib/calendario/colores';
import { INFO_CATEGORIA_EVENTO, type IconoCalendario } from '@/lib/calendario/evento';
import { abreviaturaDia, numeroDia } from '@/lib/calendario/rejilla';

type EtiquetaFila = { texto: string; fondo: string; tinta: string; icono: IconoCalendario | 'lock-closed' | null };

/**
 * Chip de la derecha: la categoría en gris neutro («Viaje», «Comer fuera», «Ocio», «Evento»), el pago en naranja,
 * el cumpleaños en fucsia y el secreto en azul. No depende solo del color: lleva texto e icono.
 */
function etiquetaDe(e: Elemento): EtiquetaFila {
  if (e.secreto) return { texto: 'Secreto · solo tú', fondo: colors.eventChip, tinta: colors.eventChipText, icono: 'lock-closed' };
  if (e.tipo === 'payment') return { texto: 'Pago', fondo: colors.pagoChip, tinta: colors.pagoChipTexto, icono: 'card-outline' };
  if (e.categoria === 'birthday') return { texto: 'Cumpleaños', fondo: colors.cumpleChip, tinta: colors.cumpleChipTexto, icono: 'gift-outline' };
  const info = INFO_CATEGORIA_EVENTO[e.categoria ?? 'other'];
  return { texto: info.etiqueta, fondo: colors.surface, tinta: colors.text, icono: info.icono };
}

/**
 * Fila de la lista: día de la semana y número (si `conDia`), marcador, título, línea y etiqueta de la categoría.
 * Sin `onPress` no es tocable. `etiquetaA11y` es lo que lee el lector de pantalla (incluye «Vais los dos»).
 */
export function FilaCalendario({
  elemento,
  linea,
  etiquetaA11y,
  marcador,
  conDia,
  hoy,
  separador,
  onPress,
}: {
  elemento: Elemento;
  linea: string;
  etiquetaA11y: string;
  marcador: MarcadorSpec;
  conDia: boolean;
  hoy: string;
  separador: boolean;
  onPress?: () => void;
}) {
  const et = etiquetaDe(elemento);
  const esHoy = elemento.fecha === hoy;
  const contenido = (
    <>
      {conDia ? (
        <View style={styles.dia}>
          <Text style={[styles.diaSemana, esHoy && styles.hoy]}>{abreviaturaDia(elemento.fecha).toUpperCase()}</Text>
          <Text style={[styles.diaNumero, esHoy && styles.hoy]}>{numeroDia(elemento.fecha)}</Text>
        </View>
      ) : null}
      <View style={styles.marcador}>
        <Marcador marcador={marcador} tamano={marcador.forma === 'anillo' ? 12 : 10} />
      </View>
      <View style={styles.textos}>
        <Text style={styles.titulo} numberOfLines={2}>
          {elemento.titulo}
        </Text>
        {linea ? (
          <Text style={styles.linea} numberOfLines={2}>
            {linea}
          </Text>
        ) : null}
      </View>
      <View style={[styles.etiqueta, { backgroundColor: et.fondo }]}>
        {et.icono ? <Ionicons name={et.icono} size={12} color={et.tinta} /> : null}
        <Text style={[styles.etiquetaTexto, { color: et.tinta }]}>{et.texto}</Text>
      </View>
    </>
  );
  const estilo = [styles.fila, separador && styles.separador];
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiquetaA11y}
      onPress={onPress}
      style={({ pressed }) => [...estilo, pressed && { opacity: 0.7 }]}
    >
      {contenido}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={etiquetaA11y} style={estilo}>
      {contenido}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 9 },
  separador: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  dia: { width: 40, alignItems: 'center' },
  marcador: { width: 12, alignItems: 'center', marginRight: -4 },
  diaSemana: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textSecondary },
  diaNumero: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text },
  hoy: { color: colors.accent },
  textos: { flex: 1, minWidth: 0, gap: 1 },
  titulo: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  linea: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  etiqueta: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.full, paddingVertical: 4, paddingHorizontal: 10 },
  etiquetaTexto: { fontFamily: fonts.bodyBold, fontSize: 12 },
});
