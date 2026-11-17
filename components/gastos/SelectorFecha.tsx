import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, FilaChips } from '@/components/gastos/Controles';
import { colors, fonts, radius } from '@/constants/theme';
import { MESES, aISO, ayerISO, deISO, fechaCorta, fechaLarga, hoyISO } from '@/lib/gastos/fechas';

const INICIALES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Fecha del gasto: «Hoy», «Ayer» u «Otro día…», que abre un calendario de un mes. Sin fechas futuras. */
export function SelectorFecha({ valor, onCambiar }: { valor: string; onCambiar: (iso: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const hoy = hoyISO();
  const ayer = ayerISO();
  const otro = valor !== hoy && valor !== ayer;
  return (
    <>
      <FilaChips>
        <Chip etiqueta="Hoy" rol="radio" activo={valor === hoy} onPress={() => onCambiar(hoy)} />
        <Chip etiqueta="Ayer" rol="radio" activo={valor === ayer} onPress={() => onCambiar(ayer)} />
        <Chip etiqueta={otro ? fechaCorta(valor) : 'Otro día…'} rol="radio" activo={otro} onPress={() => setAbierto(true)} />
      </FilaChips>
      <Modal visible={abierto} transparent animationType="slide" onRequestClose={() => setAbierto(false)}>
        <Calendario
          inicial={valor}
          onElegir={(iso) => {
            onCambiar(iso);
            setAbierto(false);
          }}
          onCerrar={() => setAbierto(false)}
        />
      </Modal>
    </>
  );
}

function Calendario({ inicial, onElegir, onCerrar }: { inicial: string; onElegir: (iso: string) => void; onCerrar: () => void }) {
  const insets = useSafeAreaInsets();
  const base = deISO(inicial);
  const [mes, setMes] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const hoy = hoyISO();
  const hoyDate = deISO(hoy);
  const esMesActual = mes.getFullYear() === hoyDate.getFullYear() && mes.getMonth() === hoyDate.getMonth();

  // Semana empezando en lunes.
  const huecos = (mes.getDay() + 6) % 7;
  const diasMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const celdas: (string | null)[] = [
    ...Array.from({ length: huecos }, () => null),
    ...Array.from({ length: diasMes }, (_, i) => aISO(new Date(mes.getFullYear(), mes.getMonth(), i + 1))),
  ];
  while (celdas.length % 7) celdas.push(null);

  const mover = (n: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1));

  return (
    <View style={styles.fondo}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Cerrar" onPress={onCerrar} />
      <View style={[styles.hoja, { paddingBottom: insets.bottom + 20 }]} accessibilityViewIsModal>
        <View style={styles.asa} />
        <View style={styles.cabecera}>
          <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" onPress={() => mover(-1)} style={styles.flecha}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.mes}>
            {MESES[mes.getMonth()]} {mes.getFullYear()}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mes siguiente"
            accessibilityState={{ disabled: esMesActual }}
            disabled={esMesActual}
            onPress={() => mover(1)}
            style={[styles.flecha, esMesActual && { opacity: 0.3 }]}
          >
            <Ionicons name="chevron-forward" size={22} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.semana}>
          {INICIALES.map((d) => (
            <Text key={d} style={styles.inicial} importantForAccessibility="no">
              {d}
            </Text>
          ))}
        </View>
        <View style={styles.rejilla}>
          {celdas.map((iso, i) => {
            if (!iso) return <View key={`v${i}`} style={styles.celda} />;
            const futuro = iso > hoy;
            const elegido = iso === inicial;
            return (
              <Pressable
                key={iso}
                accessibilityRole="button"
                accessibilityLabel={fechaLarga(iso)}
                accessibilityState={{ selected: elegido, disabled: futuro }}
                disabled={futuro}
                onPress={() => onElegir(iso)}
                style={styles.celda}
              >
                <View style={[styles.dia, elegido && styles.diaElegido, iso === hoy && !elegido && styles.diaHoy]}>
                  <Text style={[styles.diaTexto, elegido && { color: colors.white }, futuro && { color: colors.inputBorder }]}>
                    {deISO(iso).getDate()}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(42, 38, 39, 0.45)' },
  hoja: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
  },
  asa: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.inputBorder },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flecha: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mes: { fontFamily: fonts.title, fontSize: 20, color: colors.text },
  semana: { flexDirection: 'row' },
  inicial: { flex: 1, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textSecondary },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap' },
  celda: { width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center' },
  dia: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  diaElegido: { backgroundColor: colors.accent },
  diaHoy: { borderWidth: 1.5, borderColor: colors.accent },
  diaTexto: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
});
