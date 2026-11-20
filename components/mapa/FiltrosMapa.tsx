import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps, type ComponentRef, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { EmojiIcono } from '@/components/mapa/EmojiIcono';
import { colors, fonts, radius } from '@/constants/theme';
import { type Rect, posicionMenu } from '@/lib/calendario/filtros';
import {
  GRUPOS,
  type FiltrosMapa,
  OPCIONES_MAPA,
  SIN_FILTROS_MAPA,
  TITULO_GRUPO,
  alternarFiltroMapa,
  contarFiltros,
  type Grupo as GrupoMapa,
  type OpcionMapa,
  opcionesActivas,
  opcionesColecciones,
  resumenFiltrosMapa,
} from '@/lib/mapa/filtros';
import type { Coleccion } from '@/lib/mapa/tipos';

type Icono = ComponentProps<typeof Ionicons>['name'];

const ANCHO_MENU = 300;
/** Alto aproximado del menú entero (4 grupos con sus chips y el pie), para decidir si cabe debajo del botón. */
const ALTO_MENU = 440;

/**
 * Embudo de la barra del Mapa con su menú anclado (mismo patrón que el del Calendario): un `Modal` transparente con
 * un chip por opción, agrupadas. Se pueden marcar varias y no se cierra al marcar; «Listo», tocar fuera, Atrás o
 * Escape lo cierran y «Limpiar» desmarca todo.
 */
export function BotonFiltrosMapa({ valor, onCambiar, colecciones = [] }: { valor: FiltrosMapa; onCambiar: (f: FiltrosMapa) => void; colecciones?: Coleccion[] }) {
  const ventana = useWindowDimensions();
  const embudo = useRef<ComponentRef<typeof View>>(null);
  const [abierto, setAbierto] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const n = contarFiltros(valor);
  const activo = n > 0;
  // Se mide dónde está el botón al abrir (en el manejador, no en un efecto).
  const abrir = () =>
    embudo.current?.measureInWindow((x, y, width, height) => {
      setRect({ x, y, width, height });
      setAbierto(true);
    });
  const cerrar = () => setAbierto(false);
  const grupos: [GrupoMapa, readonly OpcionMapa[]][] = [
    ...GRUPOS.map((g): [GrupoMapa, readonly OpcionMapa[]] => [g, OPCIONES_MAPA[g]]),
    ...(colecciones.length > 0 ? [['colecciones', opcionesColecciones(colecciones)] as [GrupoMapa, readonly OpcionMapa[]]] : []),
  ];
  const pos = rect ? posicionMenu(rect, ventana, { ancho: ANCHO_MENU, alto: ALTO_MENU }) : null;

  return (
    <>
      <Pressable
        ref={embudo}
        accessibilityRole="button"
        accessibilityLabel={`Filtrar sitios${activo ? `: ${resumenFiltrosMapa(valor, colecciones)}` : ''}`}
        accessibilityState={{ expanded: abierto }}
        onPress={abrir}
        hitSlop={4}
        style={[styles.embudo, activo && styles.embudoActivo]}
      >
        <Ionicons name={activo ? 'funnel' : 'funnel-outline'} size={18} color={activo ? colors.accent : colors.icon} />
        {activo ? (
          <View style={styles.contador}>
            <Text style={styles.contadorTexto} maxFontSizeMultiplier={1}>
              {n}
            </Text>
          </View>
        ) : null}
      </Pressable>
      {pos ? (
        <Modal transparent visible={abierto} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={cerrar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar filtros" onPress={cerrar} style={styles.fondo} />
          <View
            accessibilityViewIsModal
            onAccessibilityEscape={cerrar}
            accessibilityLabel="Filtrar sitios"
            style={[styles.menu, { top: pos.top, left: pos.left, maxHeight: ventana.height - 2 * 16 }]}
          >
            <ScrollView bounces={false} contentContainerStyle={styles.cuerpo}>
              {grupos.map(([g, opciones]) => (
                <View key={g} style={styles.grupo}>
                  <Text accessibilityRole="header" style={styles.grupoTitulo}>
                    {TITULO_GRUPO[g]}
                  </Text>
                  <View style={styles.chips}>
                    {opciones.map((o) => {
                      const marcada = (valor[g] as string[]).includes(o.valor);
                      return (
                        <Pressable
                          key={o.valor}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: marcada }}
                          accessibilityLabel={o.etiqueta}
                          onPress={() => onCambiar(alternarFiltroMapa(valor, g, o.valor))}
                          style={({ pressed }) => [styles.chip, marcada && styles.chipMarcado, pressed && { backgroundColor: colors.pressed }]}
                        >
                          <IconoOpcion opcion={o} tamano={16} color={marcada ? colors.accent : colors.icon} />
                          <Text style={[styles.chipTexto, marcada && styles.chipTextoMarcado]} numberOfLines={1}>
                            {o.etiqueta}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={styles.separador} />
            <View style={styles.pie}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Limpiar filtros"
                accessibilityState={{ disabled: !activo }}
                disabled={!activo}
                onPress={() => onCambiar(SIN_FILTROS_MAPA)}
                style={styles.botonPie}
              >
                <Text style={[styles.limpiar, !activo && { opacity: 0.4 }]}>Limpiar</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Listo" onPress={cerrar} style={styles.botonPie}>
                <Text style={styles.listo}>Listo</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

/**
 * Fila con los filtros activos: una píldora por filtro (tocarla lo quita) en un scroll horizontal y, fijo a la derecha,
 * el botón que los quita todos. No sale si no hay ninguno.
 */
export function FiltrosActivosMapa({ valor, onCambiar, colecciones = [] }: { valor: FiltrosMapa; onCambiar: (f: FiltrosMapa) => void; colecciones?: Coleccion[] }) {
  if (contarFiltros(valor) === 0) return null;
  return (
    <Animated.View entering={FadeIn.duration(140)} style={styles.fila}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.pildoras}>
        {opcionesActivas(valor, colecciones).map((o) => (
          <Pressable
            key={`${o.grupo}:${o.valor}`}
            accessibilityRole="button"
            accessibilityLabel={`Quitar filtro ${o.etiqueta}`}
            onPress={() => onCambiar(alternarFiltroMapa(valor, o.grupo, o.valor))}
            hitSlop={{ top: 6, bottom: 6 }}
            style={({ pressed }) => [styles.pildora, pressed && { backgroundColor: colors.pressed }]}
          >
            <IconoOpcion opcion={o} tamano={14} color={colors.accent} />
            <Text style={styles.pildoraTexto} maxFontSizeMultiplier={1.2}>
              {o.etiqueta}
            </Text>
            <Ionicons name="close" size={14} color={colors.accent} />
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quitar todos los filtros"
        onPress={() => onCambiar(SIN_FILTROS_MAPA)}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        style={({ pressed }) => [styles.quitarTodos, pressed && { backgroundColor: colors.pressed }]}
      >
        <Ionicons name="funnel" size={14} color={colors.icon} />
        <Ionicons name="close" size={14} color={colors.icon} />
      </Pressable>
    </Animated.View>
  );
}

/** Icono de una opción: el emoji de la colección o un icono de Ionicons. */
function IconoOpcion({ opcion, tamano, color }: { opcion: OpcionMapa; tamano: number; color: string }) {
  return opcion.emoji ? (
    <EmojiIcono emoji={opcion.emoji} size={tamano - 1} />
  ) : (
    <Ionicons name={opcion.icono as Icono} size={tamano} color={color} />
  );
}

const styles = StyleSheet.create({
  embudo: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  embudoActivo: { borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.accentSoft },
  contador: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contadorTexto: { fontFamily: fonts.bodyBold, fontSize: 10, lineHeight: 12, color: colors.white },
  fondo: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(42, 38, 39, 0.08)' },
  menu: {
    position: 'absolute',
    width: ANCHO_MENU,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#7A3419',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cuerpo: { padding: 14, gap: 12 },
  grupo: { gap: 6 },
  grupoTitulo: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipMarcado: { borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipTexto: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  chipTextoMarcado: { fontFamily: fonts.bodyBold, color: colors.accent },
  separador: { height: 1, backgroundColor: colors.divider, marginHorizontal: 8 },
  pie: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  botonPie: { minHeight: 44, justifyContent: 'center' },
  limpiar: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textSecondary },
  listo: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.accent },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pildoras: { gap: 8, alignItems: 'center', paddingVertical: 1 },
  pildora: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  pildoraTexto: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.accent },
  quitarTodos: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
});
