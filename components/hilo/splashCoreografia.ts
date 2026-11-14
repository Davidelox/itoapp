/**
 * Coreografía de la pantalla de inicio: el recorrido del hilo y qué hace en cada instante.
 * Son funciones puras (sin React), y las que se llaman en cada fotograma son worklets.
 *
 * Tiempos (ms). Todo se deriva de un único reloj, así que no hay desfases entre capas.
 *
 *    0 -  620  El hilo entra por la izquierda y traza el tirabuzón del icono sobre «ito».
 *  620 - 1100  Sale por el borde derecho, da la vuelta por fuera, vuelve a entrar por abajo a la derecha
 *              y recorre el borde de la barra de pestañas hasta Inicio.
 * 1020 - 1400  Alguien tira: la holgura se tensa con un rebote mínimo y «ito», que estaba levantado, se posa a la vez.
 * 1420 - 1980  Se suelta la cola: el hilo se recoge a través de todo el recorrido hacia la barra.
 * 1510 - 1890  El fondo crema se desvanece y aparece la app, con el hilo todavía pasando por encima.
 * 1980 - 2130  Queda el tramo que ocupa el indicador de la pestaña y se funde con él.
 */
import { type Cubica, type Punto, type Recorrido, hermite, muelle, muestrearRecorrido, suave } from './geometria';
import { ITO_LOGOTIPO_CAJA } from './marca';
import { ANCHO_INDICADOR, type AnclaHilo, GROSOR_INDICADOR } from './relevo';

export const T_ICONO = 620;
export const T_LLEGADA = 1100;
export const T_TENSAR = 1020;
/** Instante con el hilo completo, tenso y quieto: es el estado que se muestra con «Reducir movimiento». */
export const T_REPOSO = 1400;
export const T_SOLTAR = 1420;
export const T_RECOGIDO = 1980;
export const T_FONDO = 1510;
export const DUR_FONDO = 380;
export const TOTAL_MS = 2130;

/**
 * Ancho en pantalla del lienzo de 100 unidades del icono. Con 180, «ito» mide lo mismo que en el
 * splash nativo (assets/brand/ito-splash-1024.png a 200 pt de ancho) y no hay salto al relevarlo.
 */
const LADO_ICONO = 180;
/**
 * Destino por defecto si la barra de pestañas aún no ha publicado su ancla (relevo.ts): la primera
 * de cinco pestañas, con el hilo a esta altura sobre la zona segura inferior.
 */
const ALTURA_HILO_BARRA = 59;
const PESTANAS = 5;
/** Cuánto se aleja el hilo del borde derecho al salir, para que ni la punta ni su sombra asomen. */
const FUERA_DE_PANTALLA = 50;

export type MedidasPantalla = {
  ancho: number;
  alto: number;
  inferior: number;
  /** Centro real del hilo de la barra de pestañas, si ya se conoce. */
  ancla?: AnclaHilo | null;
};

export type EscenaSplash = {
  recorrido: Recorrido;
  /** Índice del recorrido en el que termina el tirabuzón del icono. */
  indiceIcono: number;
  /** Puntos del recorrido que mide el indicador de la pestaña. */
  puntosIndicador: number;
  /** Grosor del hilo tenso, en píxeles. */
  grosor: number;
  /** Posición y tamaño del logotipo «ito» en pantalla. */
  logo: { left: number; top: number; width: number; height: number };
};

/** Calcula el recorrido del hilo para una pantalla: tenso y con holgura, con la misma estructura. */
export function escenaSplash({ ancho, alto, inferior, ancla }: MedidasPantalla): EscenaSplash {
  const u = LADO_ICONO / 100;
  // El logotipo queda centrado en la pantalla, igual que en el splash nativo.
  const ox = ancho / 2 - (ITO_LOGOTIPO_CAJA.x + ITO_LOGOTIPO_CAJA.ancho / 2) * u;
  const oy = alto / 2 - (ITO_LOGOTIPO_CAJA.y + ITO_LOGOTIPO_CAJA.alto / 2) * u;
  /** Punto del lienzo del icono llevado a la pantalla. */
  const p = (x: number, y: number): Punto => [ox + x * u, oy + y * u];

  // Tirabuzón del icono (mismo trazado que assets/brand/ito-icono.svg) y su versión con holgura:
  // el bucle es más grande y cuelga un poco, porque tiene más hilo.
  const iconoTenso: Cubica[] = [
    [p(-2, 22), p(20, 22), p(40, 12), p(56, 20)],
    [p(56, 20), p(70, 27), p(66, 42), p(58, 36)],
    [p(58, 36), p(50, 30), p(66, 18), p(86, 22)],
    [p(86, 22), p(98, 24), p(108, 36), p(114, 56)],
  ];
  const iconoFlojo: Cubica[] = [
    [p(-2, 24), p(20, 25), p(40, 16), p(56.5, 23)],
    [p(56.5, 23), p(73, 31), p(68, 49), p(57, 42)],
    [p(57, 42), p(47, 35.6), p(66, 22), p(86, 25)],
    [p(86, 25), p(99, 28), p(110, 40), p(114.5, 58)],
  ];

  // Entrada desde el borde izquierdo, algo más baja, hasta enlazar en horizontal con el icono.
  const entrada = (destino: Punto, caida: number): Cubica => {
    const inicioX = -30;
    const dx = destino[0] - inicioX;
    const desnivel = Math.min(0.14 * LADO_ICONO, 0.3 * dx);
    const y0 = oy + 22 * u + desnivel;
    return [
      [inicioX, y0],
      [inicioX + dx * 0.5, y0 + caida],
      [destino[0] - dx * 0.4, destino[1] + caida * 0.08],
      destino,
    ];
  };

  // Salida: tras el tirabuzón el hilo sale por el borde derecho, da la vuelta por fuera de la pantalla,
  // vuelve a entrar por abajo a la derecha y recorre el borde de la barra hasta la primera pestaña.
  const yBarra = ancla ? ancla.y : alto - inferior - ALTURA_HILO_BARRA;
  const xFinal = (ancla ? ancla.x : ancho / PESTANAS / 2) - ANCHO_INDICADOR / 2;
  const xFuera = ancho + FUERA_DE_PANTALLA;
  const salida = (origen: Punto, tx: number, ty: number, conHolgura: boolean): [Cubica, Cubica, Cubica] => {
    const dy = yBarra - origen[1];
    const norma = Math.hypot(tx, ty);
    // Punto exterior por el que el hilo abandona la pantalla, ya lanzado hacia la derecha y algo hacia abajo.
    const caida = Math.min(160, Math.max(60, 0.3 * dy)) + (conHolgura ? 0.04 * dy : 0);
    const fuera: Punto = [xFuera, origen[1] + caida];
    const dirX = 0.97;
    const dirY = 0.243;
    const alcance = 0.5 * (xFuera - origen[0]);
    // Vuelta por fuera: compacta, para que el hilo solo falte un instante.
    const radio = Math.min(140, 0.55 * (yBarra - fuera[1]));
    const yVuelta = conHolgura ? yBarra - 7 : yBarra;
    const vuelta: Punto = [xFuera, yVuelta];
    const tramo = xFuera - xFinal;
    return [
      [
        origen,
        [origen[0] + (tx / norma) * caida * 0.75, origen[1] + (ty / norma) * caida * 0.75],
        [fuera[0] - dirX * alcance, fuera[1] - dirY * alcance],
        fuera,
      ],
      [fuera, [fuera[0] + dirX * radio, fuera[1] + dirY * radio], [xFuera + radio, yVuelta], vuelta],
      // Con holgura el hilo aún no descansa sobre la barra: llega ondulado y se posa al final.
      [vuelta, [xFuera - tramo / 3, yVuelta], [xFinal + tramo / 3, conHolgura ? yBarra - 20 : yBarra], [xFinal, yBarra]],
    ];
  };

  const tenso = [entrada(iconoTenso[0][0], 0), ...iconoTenso, ...salida(iconoTenso[3][3], 6, 20, false)];
  const flojo = [
    entrada(iconoFlojo[0][0], 0.12 * LADO_ICONO),
    ...iconoFlojo,
    ...salida(iconoFlojo[3][3], 4.5, 18, true),
  ];

  // Un punto cada 5-11 px según el tamaño de la pantalla: suficiente para curvas limpias sin cadenas enormes.
  const paso = Math.min(11, Math.max(5, (ancho + alto) / 190));
  const recorrido = muestrearRecorrido(tenso, flojo, paso);
  return {
    recorrido,
    indiceIcono: recorrido.marcas[iconoTenso.length],
    puntosIndicador: ANCHO_INDICADOR / recorrido.paso,
    grosor: Math.min(4, Math.max(3, 1.9 * u)),
    logo: {
      left: ox + ITO_LOGOTIPO_CAJA.x * u,
      top: oy + ITO_LOGOTIPO_CAJA.y * u,
      width: ITO_LOGOTIPO_CAJA.ancho * u,
      height: ITO_LOGOTIPO_CAJA.alto * u,
    },
  };
}

/** Holgura del hilo: 1 = flojo, 0 = tenso. Empieza a ceder en la bajada y se tensa con un muelle. */
export function holguraEn(t: number): number {
  'worklet';
  if (t <= T_ICONO) return 1;
  if (t <= T_TENSAR) return 1 - 0.22 * suave((t - T_ICONO) / (T_TENSAR - T_ICONO));
  return 0.78 * muelle((t - T_TENSAR) / 1000, 24, 0.55);
}

/**
 * Índice del recorrido por el que va la punta. Dos tiempos enlazados sin parón:
 * el tirabuzón, con calma, y la vuelta por fuera hasta la barra, con impulso y una llegada suave.
 */
export function cabezaEn(t: number, ultimo: number, indiceIcono: number): number {
  'worklet';
  if (t <= 0) return 0;
  if (t >= T_LLEGADA) return ultimo;
  const velocidad = (1.15 * indiceIcono) / T_ICONO;
  if (t <= T_ICONO) return hermite(t / T_ICONO, 0, indiceIcono, velocidad * T_ICONO, velocidad * T_ICONO);
  const dur = T_LLEGADA - T_ICONO;
  const impulso = Math.min(velocidad * dur, 2.5 * (ultimo - indiceIcono));
  return hermite((t - T_ICONO) / dur, indiceIcono, ultimo, impulso, 0);
}

/** Índice por el que va la cola: quieta hasta que se suelta; luego acelera y frena al llegar al indicador. */
export function colaEn(t: number, ultimo: number, puntosIndicador: number): number {
  'worklet';
  const u = Math.min(Math.max((t - T_SOLTAR) / (T_RECOGIDO - T_SOLTAR), 0), 1);
  const avance = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  return avance * (ultimo - puntosIndicador);
}

/** El hilo flojo es algo más grueso; al tensarse se afina y al final toma el grosor del indicador. */
export function grosorEn(t: number, grosorTenso: number, holgura: number): number {
  'worklet';
  const base = grosorTenso * (1 + 0.09 * holgura);
  const inicio = T_SOLTAR + (T_RECOGIDO - T_SOLTAR) * 0.55;
  return base + (GROSOR_INDICADOR - base) * suave((t - inicio) / (T_RECOGIDO - inicio));
}

/** Opacidad del fondo crema. */
export function fondoEn(t: number): number {
  'worklet';
  return 1 - suave((t - T_FONDO) / DUR_FONDO);
}

/** Opacidad del hilo: solo se funde el tramo final, ya sobre el indicador de la pestaña. */
export function opacidadHiloEn(t: number): number {
  'worklet';
  return 1 - suave((t - T_RECOGIDO) / (TOTAL_MS - T_RECOGIDO));
}

/** Opacidad de «ito» al irse, un poco antes que el fondo. */
export function opacidadLogoEn(t: number): number {
  'worklet';
  return 1 - suave((t - (T_FONDO - 30)) / 300);
}

/**
 * Cuánto está «ito» levantado del papel (0 = posado). Se despega al llegar el hilo y se posa con
 * la misma holgura que él: mismo instante y mismo muelle, rebote incluido.
 */
export function elevacionLogoEn(t: number, holgura: number): number {
  'worklet';
  return suave(t / 260) * holgura;
}
