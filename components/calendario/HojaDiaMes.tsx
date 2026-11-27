import { Pressable, Text, View } from 'react-native';

import { Chip, FilaChips } from '@/components/gastos/Controles';
import { Hoja } from '@/components/gastos/Hoja';
import { BotonPrincipal } from '@/components/onboarding/Botones';
import { fonts } from '@/constants/theme';
import { crearEstilos } from '@/lib/tema';
import { diasDelMesCumple } from '@/lib/calendario/evento';
import { MESES } from '@/lib/gastos/fechas';

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/**
 * Día y mes de un cumpleaños (sin año: se repite cada año), en una hoja inferior: los 12 meses en chips y los
 * días de ese mes en una rejilla. Febrero llega al 29. Un día que no existe en el mes nuevo pasa al último.
 */
export function HojaDiaMes({
  visible,
  dia,
  mes,
  onCambiar,
  onCerrar,
}: {
  visible: boolean;
  dia: number;
  mes: number;
  /** Cada toque cambia día y/o mes; la hoja se cierra con «Listo». */
  onCambiar: (dia: number, mes: number) => void;
  onCerrar: () => void;
}) {
  const styles = useStyles();
  const dias = Array.from({ length: diasDelMesCumple(mes) }, (_, i) => i + 1);
  return (
    <Hoja visible={visible} titulo="Día y mes" onCerrar={onCerrar} desplazable pie={<BotonPrincipal etiqueta="Listo" onPress={onCerrar} />}>
      <Text style={styles.grande} accessibilityLiveRegion="polite">
        {dia} de {MESES[mes - 1].toLowerCase()}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Mes">
        <FilaChips>
          {MESES_CORTOS.map((nombre, i) => (
            <Chip key={nombre} rol="radio" etiqueta={nombre} activo={mes === i + 1} onPress={() => onCambiar(dia, i + 1)} />
          ))}
        </FilaChips>
      </View>
      <Text style={styles.subtitulo}>Día</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Día" style={styles.rejilla}>
        {dias.map((d) => (
          <Pressable
            key={d}
            accessibilityRole="radio"
            accessibilityLabel={`${d} de ${MESES[mes - 1].toLowerCase()}`}
            accessibilityState={{ checked: d === dia }}
            onPress={() => onCambiar(d, mes)}
            style={styles.celda}
          >
            <View style={[styles.burbuja, d === dia && styles.burbujaActiva]}>
              <Text style={[styles.celdaTexto, d === dia && styles.celdaTextoActivo]}>{d}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Hoja>
  );
}

const useStyles = crearEstilos((colors) => ({
  grande: { fontFamily: fonts.title, fontSize: 28, lineHeight: 34, color: colors.text, textAlign: 'center' },
  subtitulo: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textSecondary },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap' },
  // 7 por fila; el hueco de toque es de 46 px como mínimo en una pantalla de 375.
  celda: { width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center' },
  burbuja: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  burbujaActiva: { backgroundColor: colors.accent },
  celdaTexto: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  celdaTextoActivo: { color: colors.onAccent, fontFamily: fonts.bodyBold },
}));
