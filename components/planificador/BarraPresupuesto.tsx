import { Text, View } from 'react-native';

import { fonts } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { usePresupuestos } from '@/lib/ajustes/presupuestos';
import { type VistaPresupuesto, textoGastadoPlan, vistaPresupuesto } from '@/lib/planificador/plan';

/**
 * Presupuesto de un plan: «312 € de 900 €» con barra y «Quedan 588 €» (o «Os habéis pasado 40 €», con la barra llena
 * en granate oscuro). Sin presupuesto: «Sin presupuesto»; con presupuesto pero sin saber lo gastado, solo el presupuesto.
 */
export function BarraPresupuesto({ vista, tamano = 'normal' }: { vista: VistaPresupuesto; tamano?: 'normal' | 'grande' }) {
  const colors = useColores();
  const styles = useStyles();
  const grande = tamano === 'grande';
  if (vista.tipo !== 'barra') {
    return <Text style={[styles.texto, grande && styles.textoGrande, vista.tipo === 'ninguno' && styles.apagado]}>{vista.texto}</Text>;
  }
  return (
    <View style={styles.caja}>
      <View style={styles.fila}>
        <Text style={[styles.texto, grande && styles.textoGrande]}>{vista.texto}</Text>
        <Text style={[styles.detalle, vista.pasado && styles.pasado]}>{vista.detalle}</Text>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Presupuesto: ${vista.texto}`}
        accessibilityValue={{ min: 0, max: 100, now: vista.pct }}
        style={[styles.pista, grande && styles.pistaGrande, vista.pasado && styles.pistaPasada]}
      >
        <View style={[styles.relleno, { width: `${vista.pct}%`, backgroundColor: vista.pasado ? colors.accentDark : colors.accent }]} />
      </View>
    </View>
  );
}

/**
 * Dinero de un plan según la preferencia «Mostrar presupuestos»: activa, la barra de arriba; apagada, solo «312 € gastados»
 * (y nada si no hay gasto).
 */
export function DineroDelPlan({ presupuestoCents, gastadoCents, tamano = 'normal' }: { presupuestoCents: number | null; gastadoCents: number | null; tamano?: 'normal' | 'grande' }) {
  const styles = useStyles();
  const presupuestos = usePresupuestos();
  if (presupuestos) return <BarraPresupuesto vista={vistaPresupuesto(presupuestoCents, gastadoCents)} tamano={tamano} />;
  const texto = textoGastadoPlan(gastadoCents);
  return texto ? <Text style={[styles.texto, tamano === 'grande' && styles.textoGrande]}>{texto}</Text> : null;
}

const useStyles = crearEstilos((colors) => ({
  caja: { gap: 6 },
  fila: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  texto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  textoGrande: { fontSize: 17 },
  apagado: { fontFamily: fonts.body, color: colors.textSecondary },
  detalle: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  pasado: { fontFamily: fonts.bodyBold, color: colors.accentDark },
  pista: { height: 8, borderRadius: 4, backgroundColor: colors.surface, overflow: 'hidden' },
  pistaPasada: { backgroundColor: colors.accentSoft },
  pistaGrande: { height: 10, borderRadius: 5 },
  relleno: { height: '100%', borderRadius: 4 },
}));
