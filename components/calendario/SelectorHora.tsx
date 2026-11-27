import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Hoja } from '@/components/gastos/Hoja';
import { BotonPrincipal } from '@/components/onboarding/Botones';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';

const HORAS = Array.from({ length: 24 }, (_, i) => i);
const MINUTOS = Array.from({ length: 12 }, (_, i) => i * 5);
const dos = (n: number) => String(n).padStart(2, '0');

/**
 * Hora de un evento (`HH:MM`). Un campo que abre una hoja inferior con las horas y los minutos de 5 en 5:
 * sin librerías nativas (el selector del sistema no existe igual en iOS, Android y web).
 */
export function SelectorHora({ valor, onCambiar }: { valor: string; onCambiar: (hora: string) => void }) {
  const colors = useColores();
  const styles = useStyles();
  const [abierto, setAbierto] = useState(false);
  const hora = Number(valor.slice(0, 2));
  const minuto = Number(valor.slice(3, 5));
  const cambiar = (h: number, m: number) => onCambiar(`${dos(h)}:${dos(m)}`);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Hora: ${valor}`}
        accessibilityHint="Abre el selector de hora"
        onPress={() => setAbierto(true)}
        style={styles.campo}
      >
        <Ionicons name="time-outline" size={20} color={colors.icon} />
        <Text style={styles.valor}>{valor}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </Pressable>
      <Hoja visible={abierto} titulo="Hora" onCerrar={() => setAbierto(false)}>
        <Text style={styles.grande} accessibilityLiveRegion="polite">
          {valor}
        </Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Horas" style={styles.rejilla}>
          {HORAS.map((h) => (
            <Celda key={h} etiqueta={dos(h)} etiquetaA11y={`${h} horas`} activa={h === hora} onPress={() => cambiar(h, minuto)} />
          ))}
        </View>
        <Text style={styles.subtitulo}>Minutos</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Minutos" style={styles.rejilla}>
          {MINUTOS.map((m) => (
            <Celda key={m} etiqueta={dos(m)} etiquetaA11y={`${m} minutos`} activa={m === minuto} onPress={() => cambiar(hora, m)} />
          ))}
        </View>
        <BotonPrincipal etiqueta="Listo" onPress={() => setAbierto(false)} />
      </Hoja>
    </>
  );
}

function Celda({ etiqueta, etiquetaA11y, activa, onPress }: { etiqueta: string; etiquetaA11y: string; activa: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={etiquetaA11y}
      accessibilityState={{ checked: activa }}
      onPress={onPress}
      style={styles.celda}
    >
      <View style={[styles.burbuja, activa && styles.burbujaActiva]}>
        <Text style={[styles.celdaTexto, activa && styles.celdaTextoActivo]}>{etiqueta}</Text>
      </View>
    </Pressable>
  );
}

const useStyles = crearEstilos((colors) => ({
  campo: {
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
  valor: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  grande: { fontFamily: fonts.title, fontSize: 40, lineHeight: 46, color: colors.text, textAlign: 'center' },
  subtitulo: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textSecondary },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap' },
  // 6 por fila; el hueco de toque es de 48 px como mínimo en una pantalla de 375.
  celda: { width: `${100 / 6}%`, height: 48, alignItems: 'center', justifyContent: 'center' },
  burbuja: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  burbujaActiva: { backgroundColor: colors.accent },
  celdaTexto: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.text },
  celdaTextoActivo: { color: colors.onAccent, fontFamily: fonts.bodyBold },
}));
