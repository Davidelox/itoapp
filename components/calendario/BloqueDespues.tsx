import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { HojaQuienPago } from '@/components/calendario/HojaQuienPago';
import { FilaGasto } from '@/components/gastos/FilaGasto';
import { BotonPrincipal, BotonSecundario, EnlaceTexto } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, radius } from '@/constants/theme';
import { descartarQuienPago } from '@/lib/calendario/consultas';
import type { Evento } from '@/lib/calendario/evento';
import { usePresupuestos } from '@/lib/ajustes/presupuestos';
import { faseQuienPago, textoAntes, textoGastoGuardado, vaAlEvento } from '@/lib/calendario/quienPago';
import { useGastosDelEvento } from '@/lib/calendario/useCalendario';
import { formatearImporte } from '@/lib/dinero/importe';
import { ErrorGasto } from '@/lib/gastos/consultas';
import { personas } from '@/lib/gastos/personas';
import { totalGastadoDelPlan } from '@/lib/gastos/planes';
import { useInvalidarGastos } from '@/lib/gastos/useGastos';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * Bloque «Después del evento» del detalle (docs/plan-calendario.md §2, punto 4). Si el evento pregunta
 * «¿Quién pagó?» y vas: antes de terminar, después o resuelto. Si no pregunta (o no vas), enseña los gastos
 * enlazados y, en los que no preguntan, «Añadir gasto». `fecha` es el día concreto que se mira.
 */
export function BloqueDespues({ evento, fecha, pareja }: { evento: Evento; fecha: string; pareja: Pareja }) {
  const router = useRouter();
  const presupuestos = usePresupuestos();
  const invalidar = useInvalidarGastos();
  const p = personas(pareja);
  const yo = p.yo.slot;
  const consulta = useGastosDelEvento(evento.id);
  const gastos = consulta.data ?? [];
  const [hoja, setHoja] = useState<'pregunta' | 'anadir' | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const va = vaAlEvento(evento.attendees, yo);
  const pregunta = evento.ask_who_paid && va;
  // «Ahora» como estado para que la fase pase de «antes» a «después» sin salir del detalle: un temporizador
  // hasta `ends_at` (solo si falta menos de un día) lo actualiza. Se limpia al desmontar o al cambiar `ends_at`.
  const [ahora, setAhora] = useState(() => Date.now());
  const fin = new Date(evento.ends_at).getTime();
  const vigilaFin = pregunta && !evento.who_paid_resolved_at;
  useEffect(() => {
    if (!vigilaFin) return;
    const falta = fin - Date.now();
    if (falta > MS_DIA) return;
    const t = setTimeout(() => setAhora(Math.max(Date.now(), fin)), Math.max(falta, 0));
    return () => clearTimeout(t);
  }, [vigilaFin, fin]);
  const paraHoja = { id: evento.id, title: evento.title, budget_cents: evento.budget_cents, is_secret: evento.is_secret, fecha, category: evento.category };

  const sinGasto = async () => {
    setOcupado(true);
    setError(null);
    try {
      await descartarQuienPago(evento.id);
      await invalidar();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido guardar. Inténtalo de nuevo.');
      invalidar();
    } finally {
      setOcupado(false);
    }
  };

  const verGasto = (id: string) => router.push({ pathname: '/gastos/[id]', params: { id } });
  const hojaAbierta = hoja ? (
    <HojaQuienPago evento={paraHoja} pareja={pareja} modo={hoja} onCerrar={() => setHoja(null)} onHecho={() => setHoja(null)} />
  ) : null;

  if (pregunta) {
    const fase = faseQuienPago(evento, new Date(ahora));
    const gasto = gastos[0];
    return (
      <View style={styles.bloque}>
        <Text accessibilityRole="header" style={styles.seccion}>
          DESPUÉS DEL EVENTO
        </Text>
        {fase === 'antes' ? (
          <>
            <Text style={styles.texto}>{textoAntes(evento, evento.attendees === 'both' && !!p.otra, presupuestos)}</Text>
            <BotonPrincipal etiqueta="Ya hemos pagado" onPress={() => setHoja('pregunta')} />
          </>
        ) : fase === 'despues' ? (
          <>
            <Text style={styles.pregunta}>¿Quién pagó?</Text>
            <View style={styles.botones}>
              <View style={styles.boton}>
                <BotonPrincipal etiqueta="Apuntar gasto" deshabilitado={ocupado} onPress={() => setHoja('pregunta')} />
              </View>
              <View style={styles.boton}>
                <BotonSecundario etiqueta="No hubo gasto" deshabilitado={ocupado} onPress={sinGasto} />
              </View>
            </View>
          </>
        ) : gasto ? (
          <>
            <Text style={styles.pregunta}>{textoGastoGuardado(gasto, yo, p.nombrePareja)}</Text>
            <BotonSecundario etiqueta="Ver gasto" onPress={() => verGasto(gasto.id)} />
          </>
        ) : (
          <Text style={styles.pregunta}>Sin gasto</Text>
        )}
        <MensajeError texto={error} />
        {hojaAbierta}
      </View>
    );
  }

  // Sin pregunta: los gastos enlazados y «Añadir gasto». Si el evento pregunta pero no vas, solo la lista:
  // apuntar un gasto cerraría la pregunta de quien sí va.
  const puedeAnadir = !evento.ask_who_paid;
  if (gastos.length === 0 && !puedeAnadir) return null;
  return (
    <View style={styles.bloque}>
      <Text accessibilityRole="header" style={styles.seccion}>
        GASTOS
      </Text>
      {gastos.length > 0 ? (
        <Text style={styles.total} accessibilityLabel={`Total de los gastos del evento: ${formatearImporte(totalGastadoDelPlan(gastos))}`}>
          Total {formatearImporte(totalGastadoDelPlan(gastos))}
        </Text>
      ) : null}
      {gastos.map((g, i) => (
        <FilaGasto key={g.id} gasto={g} pareja={pareja} conFecha separador={i < gastos.length - 1} onPress={() => verGasto(g.id)} />
      ))}
      {puedeAnadir ? <EnlaceTexto etiqueta="Añadir gasto" onPress={() => setHoja('anadir')} /> : null}
      {hojaAbierta}
    </View>
  );
}

const styles = StyleSheet.create({
  bloque: {
    gap: 10,
    padding: 16,
    borderRadius: radius.xl - 4,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  seccion: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.textSecondary },
  total: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  texto: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  pregunta: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22, color: colors.text },
  botones: { flexDirection: 'row', gap: 8 },
  boton: { flex: 1 },
});
