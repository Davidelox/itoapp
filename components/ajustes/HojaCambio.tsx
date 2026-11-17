import * as Crypto from 'expo-crypto';
import { type ReactNode, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Hoja } from '@/components/gastos/Hoja';
import { BotonPrincipal } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts } from '@/constants/theme';
import { type FilaAjustes, aplicar, diferencias, hayCambios, incoherencia, textosCambios } from '@/lib/ajustes/ajustes';
import { guardarDirecto, proponer } from '@/lib/ajustes/consultas';
import { ErrorGasto } from '@/lib/gastos/error';
import { personas } from '@/lib/gastos/personas';
import { useDatosAjustes, useInvalidarGastos } from '@/lib/gastos/useGastos';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/**
 * Hoja de un ajuste de dinero (docs/plan-ajustes.md §2.3 y §3). Estando solo en el espacio, «Guardar» lo
 * cambia al momento; con la pareja unida, «Proponer cambio» crea una propuesta que la otra persona acepta.
 */
export function HojaCambio({
  titulo,
  actual,
  nuevo,
  onCerrar,
  children,
}: {
  titulo: string;
  actual: FilaAjustes;
  /** Cómo quedarían los ajustes con lo elegido en la hoja. */
  nuevo: FilaAjustes;
  onCerrar: () => void;
  children: ReactNode;
}) {
  const { pareja, refrescar } = useEstado();
  const datos = useDatosAjustes();
  const invalidar = useInvalidarGastos();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un id por propuesta distinta: reintentar la misma no crea otra, y cambiar algo después de un fallo tampoco
  // reutiliza el id de una que quizá sí se guardó.
  const ids = useRef(new Map<string, string>());

  if (!pareja) return null;
  const p = personas(pareja);
  const solo = pareja.otra === null;
  const cambios = diferencias(actual, nuevo);
  const pendiente = !solo ? (datos.data?.pendiente ?? null) : null;
  const motivo = incoherencia(aplicar(actual, cambios));
  const lineas = textosCambios(actual, cambios, p.yo.slot, p.nombrePareja);

  const enviar = async () => {
    setOcupado(true);
    setError(null);
    try {
      if (solo) {
        await guardarDirecto(pareja.coupleId, cambios);
        await refrescar();
      } else {
        const firma = JSON.stringify(cambios);
        let id = ids.current.get(firma);
        if (!id) {
          id = Crypto.randomUUID();
          ids.current.set(firma, id);
        }
        await proponer(id, pareja.coupleId, cambios);
      }
      invalidar();
      onCerrar();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido guardar. Inténtalo de nuevo.');
      if (e instanceof ErrorGasto && (e.codigo === 'pareja_unida' || e.codigo === '42501')) await refrescar();
      if (e instanceof ErrorGasto && e.codigo === '23505') invalidar();
    } finally {
      setOcupado(false);
    }
  };

  const pie = (
    <>
      {pendiente ? (
        <Text style={styles.nota}>
          {pendiente.proposed_by === pareja.yo.userId
            ? `Ya has propuesto un cambio. Espera a que ${p.nombrePareja} responda o retíralo.`
            : `${p.nombrePareja} ya ha propuesto un cambio. Respóndelo primero.`}
        </Text>
      ) : !solo && hayCambios(cambios) && !motivo ? (
        <Text style={styles.nota}>{p.nombrePareja} tendrá que aceptarlo:{lineas.map((l) => `\n· ${l}`).join('')}</Text>
      ) : null}
      <MensajeError texto={error ?? (hayCambios(cambios) ? motivo : null)} />
      <BotonPrincipal
        etiqueta={solo ? 'Guardar' : 'Proponer cambio'}
        etiquetaCargando={solo ? 'Guardando…' : 'Enviando…'}
        cargando={ocupado}
        deshabilitado={!hayCambios(cambios) || !!motivo || !!pendiente}
        onPress={enviar}
      />
    </>
  );

  return (
    <Hoja visible titulo={titulo} onCerrar={onCerrar} bloqueada={ocupado} desplazable pie={pie}>
      {children}
    </Hoja>
  );
}

const styles = StyleSheet.create({
  nota: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
});
