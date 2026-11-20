import { useQueryClient } from '@tanstack/react-query';
import { type Href, useRouter } from 'expo-router';
import type { NotificationResponse } from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { HojaPermisoAvisos } from '@/components/avisos/HojaPermisoAvisos';
import { puedeRecibirPush } from '@/lib/avisos/entorno';
import { rutaPermitida } from '@/lib/avisos/rutas';
import { cargarNotificaciones, estadoPermiso, registrarDispositivo, yaPreguntado } from '@/lib/avisos/registro';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/**
 * Avisos push en la app con el espacio listo: registra el móvil, enseña los avisos en primer plano, abre la
 * pantalla del aviso al tocarlo (también con la app cerrada) y pregunta por el permiso la primera vez.
 * No pinta nada salvo esa hoja. En Expo Go y en web no hace nada.
 */
export function Avisos() {
  const { fase } = useEstado();
  const activo = fase === 'lista' && puedeRecibirPush();
  const router = useRouter();
  const cliente = useQueryClient();
  const [preguntar, setPreguntar] = useState(false);
  const atendidos = useRef(new Set<string>());

  // Registro: al entrar y al volver a primer plano, solo con el permiso ya concedido.
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    const registrar = async () => {
      const estado = await estadoPermiso();
      if (!vivo) return;
      if (estado === 'concedido') await registrarDispositivo();
      else if (estado === 'pendiente' && !(await yaPreguntado()) && vivo) setPreguntar(true);
    };
    registrar();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && registrar());
    return () => {
      vivo = false;
      sub.remove();
    };
  }, [activo]);

  // Banner en primer plano, recarga de datos al recibir y navegación al tocar.
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    const subs: { remove: () => void }[] = [];
    cargarNotificaciones().then(async (N) => {
      if (!N || !vivo) return;
      N.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
      });
      const abrir = (r: NotificationResponse | null) => {
        if (!r || atendidos.current.has(r.notification.request.identifier)) return;
        atendidos.current.add(r.notification.request.identifier);
        const url = r.notification.request.content.data?.url;
        const ruta = rutaPermitida(url);
        if (!ruta) return;
        if (ruta === '/') router.navigate('/');
        else router.push(ruta as Href);
      };
      subs.push(
        N.addNotificationReceivedListener(() => {
          for (const k of ['gastos', 'calendario', 'mapa']) cliente.invalidateQueries({ queryKey: [k] });
        }),
        N.addNotificationResponseReceivedListener(abrir),
        N.addPushTokenListener(() => void registrarDispositivo()),
      );
      abrir(await N.getLastNotificationResponseAsync());
    });
    return () => {
      vivo = false;
      subs.forEach((x) => x.remove());
    };
  }, [activo, router, cliente]);

  return preguntar ? <HojaPermisoAvisos onCerrar={() => setPreguntar(false)} /> : null;
}
