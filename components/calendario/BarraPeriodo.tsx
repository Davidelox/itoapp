import { Ionicons } from '@expo/vector-icons';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';

import { FiltrosActivos } from '@/components/calendario/FiltrosActivos';
import { MenuFiltros } from '@/components/calendario/MenuFiltros';
import { SelectorPeriodo } from '@/components/calendario/SelectorPeriodo';
import { Segmentado } from '@/components/onboarding/OpcionRadio';
import { fonts } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import type { Filtros } from '@/lib/calendario/agrupar';
import { type Rect, quitarFiltro, resumenFiltros } from '@/lib/calendario/filtros';
import { type Vista, etiquetaPeriodoCorta, modoBarra } from '@/lib/calendario/rejilla';

/**
 * Barra única del calendario (docs/plan-cabeceras-calendario.md §3): `[Mes|Semana] [‹ periodo ›] [embudo]` en una línea.
 * El periodo va en dos líneas (el mes o las fechas, y el año) y al pulsarlo se abre un desplegable para saltar a otro
 * mes (o semana). El embudo abre el menú de filtros; con un filtro activo se tiñe de granate, lleva un contador y bajo la
 * barra salen las píldoras de los activos. Solo hay un desplegable abierto a la vez (`menu`).
 */
export function BarraPeriodo({
  vista,
  ancla,
  hoy,
  filtros,
  onVista,
  onMover,
  onSaltar,
  onFiltros,
}: {
  vista: Vista;
  ancla: string;
  hoy: string;
  filtros: Filtros;
  onVista: (v: Vista) => void;
  onMover: (n: -1 | 1) => void;
  onSaltar: (ancla: string) => void;
  onFiltros: (f: Filtros) => void;
}) {
  const colors = useColores();
  const styles = useStyles();
  const etiqueta = etiquetaPeriodoCorta(vista, ancla);
  const activo = filtros.length > 0;
  const { width: anchoVentana, fontScale } = useWindowDimensions();
  const modo = modoBarra(anchoVentana, fontScale);
  const embudo = useRef<ComponentRef<typeof View>>(null);
  const periodo = useRef<ComponentRef<typeof View>>(null);
  // Un solo desplegable abierto a la vez; `apertura` cambia en cada apertura para que el selector arranque de cero.
  const [menu, setMenu] = useState<'filtros' | 'periodo' | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [apertura, setApertura] = useState(0);
  // Se mide dónde está el botón en el momento de abrir (en el manejador, no en un efecto).
  const abrir = (cual: 'filtros' | 'periodo') => {
    (cual === 'filtros' ? embudo : periodo).current?.measureInWindow((x, y, width, height) => {
      setRect({ x, y, width, height });
      setApertura((n) => n + 1);
      setMenu(cual);
    });
  };
  const cerrar = () => setMenu(null);
  // Al cambiar de periodo se anuncia el nuevo (en iOS, la región viva no se lee sola). No se anuncia al montar.
  const anterior = useRef(etiqueta.accesible);
  useEffect(() => {
    if (anterior.current === etiqueta.accesible) return;
    anterior.current = etiqueta.accesible;
    AccessibilityInfo.announceForAccessibility(etiqueta.accesible);
  }, [etiqueta.accesible]);
  // `adjustsFontSizeToFit` no existe en web: ahí, la semana (el texto más largo) baja a 13 px.
  const tamanoPrincipal = vista === 'mes' ? 15 : Platform.OS === 'web' ? 13 : 14;

  return (
    <View style={styles.caja}>
      <View style={styles.fila}>
        <Segmentado
          compacto
          etiqueta="Vista del calendario"
          opciones={[
            { valor: 'mes', etiqueta: 'Mes' },
            { valor: 'semana', etiqueta: 'Semana' },
          ]}
          iconos={modo === 'iconos' ? { mes: 'grid-outline', semana: 'list-outline' } : undefined}
          valor={vista}
          onCambiar={onVista}
        />

        <View style={styles.navegacion}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={vista === 'mes' ? 'Mes anterior' : 'Semana anterior'}
            onPress={() => onMover(-1)}
            hitSlop={{ left: 6, right: 6 }}
            style={styles.flecha}
          >
            <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            ref={periodo}
            accessibilityRole="button"
            accessibilityLabel={`${etiqueta.accesible}. ${vista === 'mes' ? 'Elegir mes' : 'Elegir semana'}`}
            accessibilityState={{ expanded: menu === 'periodo' }}
            onPress={() => abrir('periodo')}
            style={({ pressed }) => [styles.etiqueta, pressed && styles.etiquetaPulsada]}
          >
            <Text
              style={[styles.principal, { fontSize: tamanoPrincipal }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              maxFontSizeMultiplier={1.2}
            >
              {etiqueta.principal}
            </Text>
            <View style={styles.segundaLinea}>
              <Text style={styles.secundaria} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {etiqueta.secundaria}
              </Text>
              <Ionicons name="chevron-down" size={11} color={colors.textSecondary} />
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={vista === 'mes' ? 'Mes siguiente' : 'Semana siguiente'}
            onPress={() => onMover(1)}
            hitSlop={{ left: 6, right: 6 }}
            style={styles.flecha}
          >
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <Pressable
          ref={embudo}
          accessibilityRole="button"
          accessibilityLabel={`Filtrar${activo ? `: ${resumenFiltros(filtros)}` : ''}`}
          accessibilityState={{ expanded: menu === 'filtros' }}
          onPress={() => abrir('filtros')}
          hitSlop={4}
          style={[styles.embudo, activo && styles.embudoActivo]}
        >
          <Ionicons name={activo ? 'funnel' : 'funnel-outline'} size={18} color={activo ? colors.accent : colors.icon} />
          {activo ? (
            <View style={styles.contador}>
              <Text style={styles.contadorTexto} maxFontSizeMultiplier={1}>
                {filtros.length}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <FiltrosActivos filtros={filtros} onQuitar={(f) => onFiltros(quitarFiltro(filtros, f))} onLimpiar={() => onFiltros([])} />

      <MenuFiltros visible={menu === 'filtros'} boton={rect} valor={filtros} onCambiar={onFiltros} onCerrar={cerrar} />
      <SelectorPeriodo
        key={apertura}
        visible={menu === 'periodo'}
        boton={rect}
        vista={vista}
        ancla={ancla}
        hoy={hoy}
        onElegir={onSaltar}
        onCerrar={cerrar}
      />
    </View>
  );
}

const useStyles = crearEstilos((colors) => ({
  caja: { gap: 8 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navegacion: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  flecha: { width: 30, height: 44, alignItems: 'center', justifyContent: 'center' },
  etiqueta: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  etiquetaPulsada: { backgroundColor: colors.pressed },
  segundaLinea: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  principal: { fontFamily: fonts.bodyBold, color: colors.text, textAlign: 'center' },
  secundaria: { fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 13, color: colors.textSecondary, textAlign: 'center' },
  embudo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  contadorTexto: { fontFamily: fonts.bodyBold, fontSize: 10, lineHeight: 12, color: colors.onAccent },
}));
