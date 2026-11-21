import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { HojaConfirmar } from '@/components/gastos/HojaConfirmar';
import { EnlaceTexto } from '@/components/onboarding/Botones';
import { ErrorGasto, pedirBorrar } from '@/lib/gastos/consultas';
import { ERROR_GENERICO } from '@/lib/mapa/error';
import { useInvalidarPlanificador } from '@/lib/planificador/usePlanificador';

/**
 * «Quitar del itinerario» en el detalle de un elemento de un plan: el borrado es directo (no pide aprobación a la
 * pareja), pero con confirmación en pantalla. Los gastos y sitios se conservan.
 */
export function QuitarDelItinerario({ eventoId }: { eventoId: string }) {
  const router = useRouter();
  const invalidar = useInvalidarPlanificador();
  const [abierta, setAbierta] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un id por cada vez que se abre la confirmación: reintentar tras un fallo de red no crea dos solicitudes.
  const [id, setId] = useState(() => Crypto.randomUUID());

  const quitar = async () => {
    setOcupado(true);
    setError(null);
    try {
      await pedirBorrar(id, eventoId, 'event');
      invalidar();
      setAbierta(false);
      if (router.canGoBack()) router.back();
      else router.replace('/planificador');
    } catch (e) {
      // «No existe»: ya lo quitó la otra persona; se recarga y se sale igual.
      if (e instanceof ErrorGasto && e.codigo === 'TW060') {
        invalidar();
        router.back();
        return;
      }
      setError(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <View style={{ alignItems: 'center', marginTop: 8 }}>
      <EnlaceTexto
        etiqueta="Quitar del itinerario"
        onPress={() => {
          setId(Crypto.randomUUID());
          setError(null);
          setAbierta(true);
        }}
      />
      {abierta ? (
        <HojaConfirmar
          titulo="¿Quitar del itinerario?"
          texto="Se borra el evento; los gastos y sitios se conservan. No se puede deshacer."
          etiqueta="Quitar"
          onConfirmar={quitar}
          onCerrar={() => setAbierta(false)}
          ocupado={ocupado}
          error={error}
        />
      ) : null}
    </View>
  );
}
