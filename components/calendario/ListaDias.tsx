import { StyleSheet, Text, View } from 'react-native';

import { FilaCalendario } from '@/components/calendario/FilaCalendario';
import { BotonSecundario } from '@/components/onboarding/Botones';
import { colors, fonts, radius } from '@/constants/theme';
import { type ContextoLinea, type Elemento, type Lista, etiquetaAccesible, lineaElemento } from '@/lib/calendario/agrupar';
import { type ColoresHuecos, marcador } from '@/lib/calendario/colores';

/** Lista de debajo de la rejilla: «Próximos», un día o los 7 días de la semana. */
export function ListaDias({
  lista,
  hoy,
  contexto,
  colores,
  onPago,
  onEvento,
  onNuevo,
  resaltado = null,
}: {
  lista: Lista;
  hoy: string;
  contexto: ContextoLinea;
  colores: ColoresHuecos;
  /** Un pago se abre en su gasto o su recurrente. */
  onPago: (e: Elemento) => void;
  /** Un evento se abre en su detalle (con la fecha de esa repetición). */
  onEvento: (e: Elemento) => void;
  /** «Añadir evento» bajo el texto de lista vacía; sin él no sale (p. ej. con el filtro «Pagos»). */
  onNuevo?: () => void;
  /** Id del evento o del pago cuya fila se resalta (el que se acaba de guardar). */
  resaltado?: string | null;
}) {
  return (
    <View style={styles.seccion}>
      <Text accessibilityRole="header" style={styles.titulo}>
        {lista.titulo.toUpperCase()}
      </Text>
      <View style={styles.caja}>
        {lista.vacio ? (
          <View style={styles.vacioCaja}>
            <Text style={styles.vacio}>{lista.vacio}</Text>
            {onNuevo ? <BotonSecundario etiqueta="Añadir evento" onPress={onNuevo} /> : null}
          </View>
        ) : null}
        {lista.secciones.map((s, k) => (
          <View key={s.clave}>
            {/* Info extra (cumpleaños y secretos): al final, tras una línea y con un estilo más discreto. */}
            {s.extra && k > 0 ? <View style={styles.separadorExtra} /> : null}
            {s.cabecera ? (
              <Text
                accessibilityRole="header"
                style={[styles.cabecera, s.extra && styles.cabeceraExtra, s.clave === hoy && styles.cabeceraHoy]}
              >
                {s.cabecera}
                {s.clave === hoy ? ' · hoy' : ''}
              </Text>
            ) : null}
            {s.elementos.map((e, i) => {
              const linea = lineaElemento(e, contexto);
              return (
                <FilaCalendario
                  key={e.clave}
                  elemento={e}
                  linea={linea}
                  etiquetaA11y={etiquetaAccesible(e, linea, contexto)}
                  marcador={marcador(e, colores.m1, colores.m2)}
                  conDia={lista.conDia}
                  hoy={hoy}
                  separador={i < s.elementos.length - 1}
                  discreta={s.extra}
                  resaltada={resaltado !== null && e.origenId === resaltado}
                  onPress={() => (e.tipo === 'payment' ? onPago(e) : onEvento(e))}
                />
              );
            })}
            {s.elementos.length === 0 && s.vacio ? <Text style={styles.nada}>{s.vacio}</Text> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  seccion: { gap: 6 },
  titulo: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.textSecondary },
  caja: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl - 4,
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  vacioCaja: { gap: 12, paddingVertical: 16 },
  vacio: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  cabecera: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, paddingTop: 12, paddingBottom: 2 },
  separadorExtra: { height: 1, backgroundColor: colors.divider, marginTop: 4 },
  cabeceraExtra: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.4, color: colors.textSecondary, paddingTop: 8, paddingBottom: 0 },
  cabeceraHoy: { color: colors.accent },
  nada: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, paddingBottom: 8 },
});
