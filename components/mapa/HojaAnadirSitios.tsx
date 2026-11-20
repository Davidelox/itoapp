import { useState } from 'react';
import { Text } from 'react-native';

import { Hoja } from '@/components/gastos/Hoja';
import { SitiosMarcables } from '@/components/mapa/SitiosMarcables';
import { BotonPrincipal } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts } from '@/constants/theme';
import { ErrorGasto } from '@/lib/gastos/error';
import { anadirSitiosAColeccion } from '@/lib/mapa/consultasColecciones';
import { ERROR_GENERICO } from '@/lib/mapa/error';
import type { Coleccion, Sitio } from '@/lib/mapa/tipos';
import { useInvalidarMapa } from '@/lib/mapa/useSitios';

/** «Añadir sitios» del detalle de una colección: hoja inferior con casillas para los sitios que aún no están en ella. Se monta al abrirla. */
export function HojaAnadirSitios({ coleccion, coupleId, sitios, onCerrar }: { coleccion: Coleccion; coupleId: string; sitios: Sitio[]; onCerrar: () => void }) {
  const invalidar = useInvalidarMapa();
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setOcupado(true);
    setError(null);
    try {
      await anadirSitiosAColeccion(coleccion.id, coupleId, elegidos);
      await invalidar();
      onCerrar();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
    } finally {
      setOcupado(false);
    }
  };
  const n = elegidos.length;
  return (
    <Hoja
      visible
      titulo={`Añadir a ${coleccion.icon} ${coleccion.name}`}
      onCerrar={onCerrar}
      bloqueada={ocupado}
      desplazable
      pie={<BotonPrincipal etiqueta={n === 0 ? 'Elige sitios' : n === 1 ? 'Añadir 1 sitio' : `Añadir ${n} sitios`} deshabilitado={n === 0} cargando={ocupado} onPress={guardar} />}
    >
      <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary }}>Sitios guardados que aún no están en esta colección.</Text>
      <SitiosMarcables sitios={sitios} elegidos={elegidos} onAlternar={(id) => setElegidos((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]))} />
      <MensajeError texto={error} />
    </Hoja>
  );
}
