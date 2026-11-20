import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Hoja } from '@/components/gastos/Hoja';
import { SelectorColecciones } from '@/components/mapa/SelectorColecciones';
import { BotonPrincipal } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { ErrorGasto } from '@/lib/gastos/error';
import { type Seleccion, hayCambiosColecciones, pasosGuardado } from '@/lib/mapa/colecciones';
import { guardarColeccionesDeSitio } from '@/lib/mapa/consultasColecciones';
import { ERROR_GENERICO } from '@/lib/mapa/error';
import type { Coleccion, Sitio } from '@/lib/mapa/tipos';
import { useInvalidarMapa } from '@/lib/mapa/useSitios';

/**
 * «Añadir a colección» de la ficha (mockups DetalleSitio y GuardarSitio): hoja inferior con el selector de varias colecciones.
 * Se monta al abrirla, así parte siempre de lo guardado. `actual`: las colecciones del sitio y su principal.
 */
export function HojaColecciones({
  sitio,
  coupleId,
  colecciones,
  actual,
  onCerrar,
}: {
  sitio: Pick<Sitio, 'id'>;
  coupleId: string;
  colecciones: Coleccion[];
  actual: Seleccion;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const invalidar = useInvalidarMapa();
  const [sel, setSel] = useState(actual);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    const pasos = pasosGuardado(actual, sel);
    if (!hayCambiosColecciones(pasos)) return onCerrar();
    setOcupado(true);
    setError(null);
    try {
      await guardarColeccionesDeSitio(sitio.id, coupleId, pasos);
      await invalidar();
      onCerrar();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
      await invalidar();
    } finally {
      setOcupado(false);
    }
  };
  const nueva = () => {
    onCerrar();
    router.push({ pathname: '/mapa/coleccion/nueva', params: { sitio: sitio.id } });
  };

  return (
    <Hoja
      visible
      titulo="Colecciones"
      onCerrar={onCerrar}
      bloqueada={ocupado}
      desplazable
      pie={<BotonPrincipal etiqueta="Guardar" cargando={ocupado} onPress={guardar} />}
    >
      <SelectorColecciones colecciones={colecciones} valor={sel} onCambiar={setSel} onNueva={nueva} />
      <MensajeError texto={error} />
    </Hoja>
  );
}
