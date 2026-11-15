import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { registrarError } from '@/lib/registro';

/**
 * Avatares privados: el bucket `avatars` no es público, así que se firma cada ruta durante una hora.
 * Las URLs firmadas solo viven en memoria (no se registran ni se guardan en AsyncStorage) y se renuevan
 * a los 50 minutos. Quien muestre la imagen debe usar `cacheKey: path` para que el disco se indexe por la ruta.
 */
const VIDA_URL_MS = 50 * 60 * 1000;
const cache = new Map<string, { url: string; hasta: number }>();
const pendientes = new Map<string, Promise<string | null>>();

export async function urlFirmada(path: string): Promise<string | null> {
  const guardada = cache.get(path);
  if (guardada && guardada.hasta > Date.now()) return guardada.url;
  const enCurso = pendientes.get(path);
  if (enCurso) return enCurso;
  const peticion = (async () => {
    const { data, error } = await supabase.storage.from('avatars').createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      registrarError('avatar.firmar', error);
      return null;
    }
    cache.set(path, { url: data.signedUrl, hasta: Date.now() + VIDA_URL_MS });
    return data.signedUrl;
  })().finally(() => pendientes.delete(path));
  pendientes.set(path, peticion);
  return peticion;
}

/** URL firmada de un avatar (o null si no hay foto o aún no está lista). */
export function useUrlAvatar(path: string | null | undefined): string | null {
  const [resuelta, setResuelta] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (!path) return;
    let activo = true;
    urlFirmada(path).then((url) => {
      if (activo && url) setResuelta({ path, url });
    });
    return () => {
      activo = false;
    };
  }, [path]);
  return path && resuelta?.path === path ? resuelta.url : null;
}

/** Se llama al cerrar sesión: no debe quedar nada de la cuenta anterior. */
export function limpiarCacheAvatares() {
  cache.clear();
  pendientes.clear();
}
