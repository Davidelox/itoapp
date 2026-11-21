import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

import { type SitioBuscado, textoBuscable } from '@/lib/mapa/busqueda';
import { buscarSitios } from '@/lib/mapa/consultas';
import type { Region } from '@/lib/mapa/encuadre';
import { esEcoDeSeleccion } from '@/lib/mapa/sugerencias';
import { type Centro, MAX_SUGERENCIAS, PAUSA_SUGERENCIAS_MS, regionMovida, textoSugerible } from '@/lib/mapa/resultados';

type Consulta = { texto: string; centro: Centro | null };

/**
 * Búsqueda de sitios dentro de la pestaña Mapa. Al escribir (pausa de 500 ms) o enviar busca alrededor del centro del
 * mapa visible; al mover el mapa NO busca sola: ofrece «Buscar en esta zona» (`movido`). `region`: última región del mapa
 * (solo se lee en manejadores, nunca al pintar).
 */
export function useBusquedaMapa(region: RefObject<Region | null>) {
  const [escrito, setEscrito] = useState('');
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [movido, setMovido] = useState(false);
  // Autocompletado (la cascada bajo la barra) y resultado elegido de ella que no está entre los de la consulta.
  const [pidiendo, setPidiendo] = useState<Consulta | null>(null);
  const [abierta, setAbierta] = useState(false);
  const [extra, setExtra] = useState<SitioBuscado | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const base = useRef<Region | null>(null);
  // Texto que dejó la última selección: si el campo lo devuelve tal cual, no es que la persona escriba.
  const textoElegido = useRef<string | null>(null);
  const ventana = useRef(0);
  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  const q = useQuery({
    queryKey: ['mapa-busqueda-mapa', consulta?.texto, consulta?.centro ? `${consulta.centro.lat.toFixed(3)},${consulta.centro.lng.toFixed(3)}` : null],
    queryFn: ({ signal }) => buscarSitios((consulta as Consulta).texto, consulta?.centro ?? undefined, signal),
    enabled: consulta !== null,
    staleTime: 5 * 60_000,
    retry: false,
  });
  // Al llegar los resultados el mapa se encuadra solo: ese movimiento no cuenta como «moverse».
  useEffect(() => {
    if (q.data) ventana.current = Date.now() + 2000;
  }, [q.data]);
  const claveCentro = (c: Centro | null | undefined) => (c ? `${c.lat.toFixed(3)},${c.lng.toFixed(3)}` : null);
  // Cada petición cancela la anterior (signal); si el tope de Photon se alcanza, falla en silencio y no se sugiere.
  const sug = useQuery({
    queryKey: ['mapa-sugerencias', pidiendo?.texto, claveCentro(pidiendo?.centro)],
    queryFn: ({ signal }) => buscarSitios((pidiendo as Consulta).texto, pidiendo?.centro ?? undefined, signal),
    enabled: pidiendo !== null && abierta,
    staleTime: 5 * 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
  const sugerencias = useMemo(() => (abierta && pidiendo ? (sug.data ?? []).slice(0, MAX_SUGERENCIAS) : []), [abierta, pidiendo, sug.data]);
  const resultados = useMemo(() => (consulta ? q.data : undefined), [consulta, q.data]);

  const lanzar = (texto: string | null) => {
    base.current = null;
    setMovido(false);
    setSeleccionado(null);
    setExtra(null);
    setAbierta(false);
    const r = region.current;
    setConsulta(texto ? { texto, centro: r ? { lat: r.latitude, lng: r.longitude } : null } : null);
  };
  // Al escribir solo se sugiere (a partir de 3 letras, con pausa); la búsqueda completa va al enviar.
  const escribir = (t: string) => {
    setEscrito(t);
    if (esEcoDeSeleccion(t, textoElegido.current)) return;
    textoElegido.current = null;
    setAbierta(true);
    if (temporizador.current) clearTimeout(temporizador.current);
    if (textoSugerible(t) === null) return setPidiendo(null);
    temporizador.current = setTimeout(() => {
      const r = region.current;
      setPidiendo({ texto: textoSugerible(t) as string, centro: r ? { lat: r.latitude, lng: r.longitude } : null });
    }, PAUSA_SUGERENCIAS_MS);
  };
  const enviar = () => {
    Keyboard.dismiss();
    if (temporizador.current) clearTimeout(temporizador.current);
    lanzar(textoBuscable(escrito));
  };
  const enEstaZona = () => lanzar(textoBuscable(escrito));
  const limpiar = () => {
    Keyboard.dismiss();
    if (temporizador.current) clearTimeout(temporizador.current);
    setPidiendo(null);
    textoElegido.current = null;
    setEscrito('');
    lanzar(null);
  };
  const cerrarSugerencias = () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    setAbierta(false);
  };
  /** Deselecciona (el mapa vuelve a su encuadre): ese movimiento tampoco cuenta como «moverse». */
  const deseleccionar = () => {
    if (seleccionado !== null) ventana.current = Date.now() + 2000;
    setSeleccionado(null);
  };
  /** Elige una sugerencia: pasa a ser un resultado más (con pin), con su zoom y su tarjeta; cierra teclado y cascada. */
  const elegirSugerencia = (s: SitioBuscado) => {
    cerrarSugerencias();
    textoElegido.current = s.nombre;
    setEscrito(s.nombre);
    if (!q.data?.some((x) => x.provider_place_id === s.provider_place_id)) setExtra(s);
    elegir(s.provider_place_id);
  };
  /** Elige un resultado: cierra el teclado y el mapa hace zoom a él (ese movimiento no cuenta como «moverse»). */
  const elegir = (id: string) => {
    cerrarSugerencias();
    Keyboard.dismiss();
    ventana.current = Date.now() + 2000;
    setSeleccionado(id);
  };
  /** Cada vez que el mapa termina de moverse. */
  const alMoverse = (r: Region) => {
    if (!consulta) return;
    if (base.current === null || Date.now() < ventana.current) base.current = r;
    else if (regionMovida(base.current, r)) setMovido(true);
  };

  return {
    escrito,
    activa: consulta !== null || extra !== null,
    cargando: consulta !== null && q.isFetching,
    error: consulta !== null && q.isError && !q.isFetching ? q.error : null,
    resultados,
    seleccionado,
    setSeleccionado,
    deseleccionar,
    extra,
    sugerencias,
    abierta,
    cerrarSugerencias,
    elegirSugerencia,
    elegir,
    movido,
    escribir,
    enviar,
    enEstaZona,
    limpiar,
    alMoverse,
  };
}
