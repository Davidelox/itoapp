import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { BotonPrincipal, BotonSecundario, EnlaceTexto } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { Pantalla } from '@/components/onboarding/Pantalla';
import { colors, fonts, radius } from '@/constants/theme';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { type CodigoVigente, codigoVigente, nuevoCodigo, salirDelEspacio } from '@/lib/pareja/acciones';
import { formatearCodigo } from '@/lib/pareja/codigo';
import { registrarError } from '@/lib/registro';

const PAUSA_UNIDO_MS = 1800;

type Carga = { estado: 'cargando' } | { estado: 'error' } | { estado: 'ok'; codigo: CodigoVigente | null };

/**
 * Invitar a la pareja con el código del espacio. `onboarding`: paso final del primer uso (con «Continuar
 * sin esperar»). `inicio`: se abre desde la tarjeta «Tu pareja aún no se ha unido» de Inicio.
 */
export function PantallaInvitar({ modo }: { modo: 'onboarding' | 'inicio' }) {
  const router = useRouter();
  const { pareja, refrescar, marcarInvitacionVista, soltarFase } = useEstado();
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' });
  const [copiado, setCopiado] = useState(false);
  const [creando, setCreando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const otra = pareja?.otra ?? null;
  const unida = otra !== null;
  const nombreOtra = otra?.nombre.trim() || 'Tu pareja';

  const cargar = useCallback(async () => {
    setCarga({ estado: 'cargando' });
    try {
      setCarga({ estado: 'ok', codigo: await codigoVigente() });
    } catch {
      setCarga({ estado: 'error' });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  // Al unirse la pareja se deja ver el aviso un momento y se continúa.
  useEffect(() => {
    if (modo !== 'onboarding' || !unida) return;
    const t = setTimeout(async () => {
      await marcarInvitacionVista();
      soltarFase();
    }, PAUSA_UNIDO_MS);
    return () => clearTimeout(t);
  }, [modo, unida, marcarInvitacionVista, soltarFase]);

  const codigo = carga.estado === 'ok' ? carga.codigo : null;
  const visible = codigo && !codigo.caducado ? formatearCodigo(codigo.codigo) : null;

  const copiar = async () => {
    if (!visible) return;
    try {
      await Clipboard.setStringAsync(visible.replace('·', ''));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (e) {
      registrarError('invitar.copiar', e);
    }
  };

  const compartir = async () => {
    if (!visible) return;
    try {
      await Share.share({ message: `Únete a mi espacio en ito con este código: ${visible}` });
    } catch (e) {
      registrarError('invitar.compartir', e);
    }
  };

  const crearOtro = async () => {
    setError(null);
    setCreando(true);
    const r = await nuevoCodigo();
    setCreando(false);
    if (!r.ok) setError(r.mensaje);
    else cargar();
  };

  const equivocado = async () => {
    setError(null);
    setSaliendo(true);
    const r = await salirDelEspacio();
    if (!r.ok) {
      setSaliendo(false);
      setError(r.mensaje);
      return;
    }
    await refrescar();
    setSaliendo(false);
  };

  const caduca = codigo ? codigo.caduca.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : null;
  const puedeEquivocarse = modo === 'onboarding' && pareja?.yo.slot === 'm1' && !unida;

  return (
    <Pantalla
      paso={modo === 'onboarding' ? 4 : undefined}
      titulo="Invita a tu pareja"
      subtitulo="Compárteles este código para que se una a vuestro espacio."
      onAtras={modo === 'inicio' ? () => (router.canGoBack() ? router.back() : router.replace('/')) : undefined}
      pie={
        modo === 'onboarding' ? (
          <BotonPrincipal
            etiqueta={unida ? 'Continuar' : 'Continuar sin esperar'}
            onPress={async () => {
              await marcarInvitacionVista();
              soltarFase();
            }}
          />
        ) : undefined
      }
    >
      <View style={styles.cajaCodigo}>
        {carga.estado === 'cargando' || creando ? (
          <CargandoHilo color={colors.textSecondary} accessibilityLabel="Cargando el código" />
        ) : carga.estado === 'error' ? (
          <View style={styles.centrado}>
            <Text style={styles.caducado}>No se ha podido cargar el código.</Text>
            <EnlaceTexto etiqueta="Reintentar" onPress={cargar} />
          </View>
        ) : visible ? (
          <Text
            accessibilityLabel={`Código ${visible.replace('·', ' ')}`}
            adjustsFontSizeToFit
            numberOfLines={1}
            selectable
            style={styles.codigo}
          >
            {visible}
          </Text>
        ) : (
          <View style={styles.centrado}>
            <Text style={styles.caducado}>Este código ha caducado</Text>
            <BotonSecundario etiqueta="Crear otro código" onPress={crearOtro} />
          </View>
        )}
      </View>

      {visible ? (
        <View style={styles.acciones}>
          <View style={styles.accion}>
            <BotonSecundario etiqueta={copiado ? 'Código copiado' : 'Copiar código'} onPress={copiar} />
          </View>
          <View style={styles.accion}>
            <BotonSecundario etiqueta="Compartir" onPress={compartir} />
          </View>
        </View>
      ) : null}

      <View style={styles.pareja}>
        <AvatarPersona nombre={pareja?.yo.nombre ?? ''} color={pareja?.yo.color ?? null} avatarPath={pareja?.yo.avatarPath} tamano={52} />
        <View style={[styles.hilo, unida && styles.hiloUnido]} />
        <AvatarPersona nombre={otra?.nombre ?? ''} color={otra?.color ?? null} avatarPath={otra?.avatarPath} tamano={52} />
      </View>
      <Text accessibilityLiveRegion="polite" style={[styles.estado, unida && styles.estadoUnido]}>
        {unida ? `¡${nombreOtra} se ha unido!` : 'Esperando a que tu pareja se una…'}
      </Text>

      {caduca && visible ? <Text style={styles.caduca}>El código caduca el {caduca}.</Text> : null}
      <MensajeError texto={error} />

      {puedeEquivocarse &&
        (confirmando ? (
          <View style={styles.confirmacion}>
            <Text style={styles.confirmacionTexto}>
              Se borrará el espacio que acabas de crear y podrás unirte con el código de tu pareja.
            </Text>
            <BotonPrincipal etiqueta="Sí, tengo un código" etiquetaCargando="Un momento…" cargando={saliendo} onPress={equivocado} />
            <EnlaceTexto etiqueta="Cancelar" onPress={() => setConfirmando(false)} />
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setConfirmando(true)} style={styles.equivocado}>
            <Text style={styles.equivocadoTexto}>
              ¿Te has equivocado? <Text style={styles.enlace}>Tengo un código</Text>
            </Text>
          </Pressable>
        ))}
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  cajaCodigo: {
    minHeight: 112,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  codigo: { fontFamily: fonts.titleBold, fontSize: 52, letterSpacing: 6, color: colors.text, maxWidth: '100%' },
  centrado: { alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  caducado: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  acciones: { flexDirection: 'row', gap: 12 },
  accion: { flex: 1 },
  pareja: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  hilo: { width: 64, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.textSecondary },
  hiloUnido: { borderStyle: 'solid', borderColor: colors.accent },
  estado: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textSecondary, textAlign: 'center' },
  estadoUnido: { color: colors.accent, fontFamily: fonts.bodyBold },
  caduca: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  confirmacion: { gap: 8, padding: 16, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  confirmacionTexto: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  equivocado: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  equivocadoTexto: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
  enlace: { fontFamily: fonts.bodyBold, color: colors.accent },
});
