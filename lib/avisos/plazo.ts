/** Pasos del registro de avisos y su plazo (ms). El permiso espera al usuario, por eso es el más largo. */
export type Paso = 'config' | 'permiso' | 'canal' | 'token' | 'servidor';
export const PLAZOS: Record<'permiso' | 'lectura' | 'token' | 'servidor', number> = {
  permiso: 30_000,
  lectura: 10_000,
  token: 15_000,
  servidor: 15_000,
};

export type Fallo = { paso: Paso; motivo: 'timeout' | 'error'; detalle: string };
export type Intento = {
  hora: string;
  permiso: string | null;
  ok: boolean;
  fallo: Fallo | null;
  projectId: boolean;
  dispositivoReal: boolean;
};

export class ErrorPlazo extends Error {
  constructor() {
    super('plazo agotado');
    this.name = 'ErrorPlazo';
  }
}

/** La promesa o el plazo, lo que ocurra antes. Limpia el temporizador. */
export function conPlazo<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const plazo = new Promise<never>((_, rechazar) => {
    t = setTimeout(() => rechazar(new ErrorPlazo()), ms);
  });
  return Promise.race([promesa, plazo]).finally(() => clearTimeout(t));
}

/** Ejecuta un paso: nunca lanza; devuelve el valor o el fallo con su paso. */
export async function ejecutarPaso<T>(
  paso: Paso,
  ms: number,
  tarea: () => Promise<T>,
): Promise<{ ok: true; valor: T } | { ok: false; fallo: Fallo }> {
  try {
    return { ok: true, valor: await conPlazo(Promise.resolve().then(tarea), ms) };
  } catch (e) {
    if (e instanceof ErrorPlazo) return { ok: false, fallo: { paso, motivo: 'timeout', detalle: 'plazo agotado' } };
    const m = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
    return { ok: false, fallo: { paso, motivo: 'error', detalle: m.slice(0, 120) } };
  }
}

const NOMBRE_PASO: Record<Paso, string> = {
  config: 'configuración',
  permiso: 'permiso',
  canal: 'canal',
  token: 'token',
  servidor: 'servidor',
};

/** «Último intento: permiso concedido · token: tiempo agotado a las 21:05». */
export function textoIntento(i: Intento): string {
  const h = new Date(i.hora);
  const hora = `${String(h.getHours()).padStart(2, '0')}:${String(h.getMinutes()).padStart(2, '0')}`;
  const permiso = i.permiso ? `permiso ${i.permiso}` : 'permiso sin leer';
  const resultado = i.ok
    ? 'registrado'
    : i.fallo
      ? `${NOMBRE_PASO[i.fallo.paso]}: ${i.fallo.motivo === 'timeout' ? 'tiempo agotado' : `error (${i.fallo.detalle})`}`
      : 'sin registrar';
  return `Último intento: ${permiso} · ${resultado} a las ${hora} · projectId ${i.projectId ? 'sí' : 'no'} · dispositivo real ${i.dispositivoReal ? 'sí' : 'no'}`;
}
