import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { EmojiIcono } from '@/components/mapa/EmojiIcono';
import { colors } from '@/constants/theme';
import { INFO_CATEGORIA_SITIO } from '@/lib/mapa/categorias';
import type { CategoriaSitio, EstadoSitio } from '@/lib/mapa/tipos';

/**
 * Pin de un sitio (docs/plan-mapa.md §5.2). El estado va en la forma, no solo en el color: «Quiero ir» = relleno blanco con
 * contorno e icono granates; «Hemos ido» = relleno granate con icono blanco. Candado arriba a la derecha si es privado; puntito de calendario arriba a la izquierda si tiene un plan próximo.
 * Sin colores de persona. `tamano` es el diámetro de la insignia (el pico va debajo). Oculto a los lectores de pantalla:
 * lo que dice está en la etiqueta de la fila o del `Marker`.
 */
/** Ajuste fino del emoji en los pines dentro de un `Marker` del mapa (`enMapa`): fracción de su tamaño, negativa = a la izquierda. Si en el
 *  iPhone sigue corrido a la derecha, subir el valor en negativo (p. ej. -0,12); si se pasa, bajarlo. */
const AJUSTE_EMOJI_MAPA = -0.025;

export function PinSitio({
  categoria,
  estado,
  privado = false,
  conPlan = false,
  tamano = 32,
  conPico = false,
  emoji = null,
  enMapa = false,
}: {
  categoria: CategoriaSitio;
  estado: EstadoSitio;
  privado?: boolean;
  /** Puntito de calendario arriba a la izquierda: el sitio tiene un evento futuro enlazado. */
  conPlan?: boolean;
  tamano?: number;
  conPico?: boolean;
  /** Icono de la colección principal (o de la filtrada): sustituye al de la categoría. La forma y el candado siguen igual. */
  emoji?: string | null;
  /** El pin va dentro de un `Marker` del mapa (se convierte en imagen): el emoji lleva allí un ajuste fino que fuera sobra. */
  enMapa?: boolean;
}) {
  const fue = estado === 'been';
  const lado = Math.round(tamano * 0.28);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.caja}>
      <View
        style={[
          styles.insignia,
          { width: tamano, height: tamano, borderRadius: tamano / 2 },
          fue ? styles.insigniaFue : styles.insigniaQuiero,
        ]}
      >
        {emoji ? (
          <EmojiIcono emoji={emoji} size={Math.round(tamano * 0.5)} contorno={fue} desplazarX={enMapa ? AJUSTE_EMOJI_MAPA : 0} />
        ) : (
          <Ionicons name={INFO_CATEGORIA_SITIO[categoria].icono} size={Math.round(tamano * 0.5)} color={fue ? colors.white : colors.accent} />
        )}
      </View>
      {conPico ? (
        <View
          style={[
            styles.pico,
            { borderLeftWidth: lado / 2, borderRightWidth: lado / 2, borderTopWidth: lado, borderTopColor: colors.accent },
          ]}
        />
      ) : null}
      {conPlan ? (
        <View style={[styles.plan, { width: tamano * 0.5, height: tamano * 0.5, borderRadius: tamano * 0.25 }]}>
          <Ionicons name="calendar" size={Math.round(tamano * 0.3)} color={colors.accent} />
        </View>
      ) : null}
      {privado ? (
        <View style={[styles.candado, { width: tamano * 0.5, height: tamano * 0.5, borderRadius: tamano * 0.25 }]}>
          <Ionicons name="lock-closed" size={Math.round(tamano * 0.3)} color={colors.text} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { alignItems: 'center' },
  insignia: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.accent },
  insigniaQuiero: { backgroundColor: colors.white },
  insigniaFue: { backgroundColor: colors.accent },
  pico: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  plan: {
    position: 'absolute',
    top: -4,
    left: -6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  candado: {
    position: 'absolute',
    top: -4,
    right: -6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
