import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { CabeceraPestana, useScrollCabecera } from '@/components/CabeceraPestana';
import { HojaSaldar } from '@/components/gastos/HojaSaldar';
import { TarjetaSaldo } from '@/components/gastos/TarjetaSaldo';
import {
  AvisoInvitacion,
  EstaSemana,
  PrimerosPasos,
  TarjetaBienvenida,
  TarjetaMultidia,
  TarjetaProximoPlan,
  UltimoLugar,
  UltimosMovimientos,
} from '@/components/inicio/TarjetasInicio';
import { HiloPareja } from '@/components/inicio/HiloPareja';
import { TarjetasPendientes } from '@/components/inicio/TarjetasPendientes';
import { BotonSecundario } from '@/components/onboarding/Botones';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { boteConPendiente } from '@/lib/gastos/bote';
import { hoyISO } from '@/lib/gastos/fechas';
import { useDatosAjustes, useInvalidarGastos, useSaldo } from '@/lib/gastos/useGastos';
import { estadoInicio, fechaSaludo, textoCaducidad } from '@/lib/inicio/inicio';
import { useAgenda, useCodigoVigente, usePanelActividad, usePrimerosPasos } from '@/lib/inicio/useInicio';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/** Pestaña Inicio (mockups Main e Inicio-vacio): próximo plan, saldo, pendientes y primeros pasos. */
export default function Inicio() {
  const router = useRouter();
  const { onScroll, sombra } = useScrollCabecera();
  const { pareja } = useEstado();
  const cliente = useQueryClient();
  const invalidar = useInvalidarGastos();
  const saldo = useSaldo();
  const agenda = useAgenda();
  const actividad = usePanelActividad();
  const pasos = usePrimerosPasos();
  const codigo = useCodigoVigente();
  const sinPareja = useDatosAjustes().data?.sinPareja;
  const [saldando, setSaldando] = useState(false);
  // Solo el tirón del usuario muestra el indicador de recarga: con las lecturas en segundo plano, iOS dejaba el hueco del indicador sobre el contenido.
  const [recargando, setRecargando] = useState(false);

  if (!pareja) return null;
  const hoy = hoyISO();
  const unida = pareja.otra !== null;
  const cargando = (unida && saldo.isLoading) || agenda.cargando || pasos.cargando;
  const fallo = (unida && saldo.isError) || agenda.error || pasos.error;
  const estado = estadoInicio({ unida, parejaBorrada: sinPareja?.estado === 'borrada', hayPlan: agenda.evento !== null || agenda.multidia !== null, hechos: pasos.hechos });
  const refrescar = async () => {
    setRecargando(true);
    await Promise.all([
      invalidar(),
      cliente.invalidateQueries({ queryKey: ['mapa', pareja.coupleId] }),
      cliente.invalidateQueries({ queryKey: ['invitacion', pareja.coupleId] }),
    ]);
    setRecargando(false);
  };
  const refrescando = saldo.isRefetching || agenda.refrescando;
  const tituloAviso = sinPareja?.estado === 'salio' ? `${sinPareja.nombre} salió del espacio` : 'Tu pareja aún no se ha unido';
  const detalleAviso = sinPareja?.estado === 'salio' ? null : textoCaducidad(codigo.data?.caduca ?? null);

  return (
    <View style={styles.raiz}>
      <CabeceraPestana
        titulo={`Hola, ${pareja.yo.nombre.trim() || 'tú'}`}
        sobretitulo={fechaSaludo(hoy)}
        accion={<HiloPareja />}
        sombra={sombra}
        cargando={cargando || refrescando}
      />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.contenido}
        refreshControl={
          <RefreshControl refreshing={recargando} onRefresh={refrescar} tintColor="transparent" colors={['transparent']} progressBackgroundColor="transparent" />
        }
      >
        {cargando ? null : fallo ? (
          <View style={styles.vacio}>
            <Text style={styles.vacioTexto}>No se ha podido cargar el inicio.</Text>
            <BotonSecundario etiqueta="Reintentar" onPress={refrescar} />
          </View>
        ) : (
          <>
            {estado.bienvenida ? <TarjetaBienvenida pareja={pareja} /> : null}
            {agenda.evento ? <TarjetaProximoPlan plan={agenda.evento} distancia={agenda.distancia} hoy={hoy} reservado={agenda.reservado} /> : null}
            {estado.invitacion ? <AvisoInvitacion titulo={tituloAviso} detalle={detalleAviso} /> : null}
            {estado.saldo ? (
              <TarjetaSaldo
                saldo={saldo.data ?? null}
                pareja={pareja}
                onSaldar={() => setSaldando(true)}
                bote={
                  saldo.data && (saldo.data.pot_enabled || boteConPendiente(saldo.data))
                    ? { cents: saldo.data.pot_balance_cents, onAbrir: () => router.push('/gastos/bote') }
                    : undefined
                }
              />
            ) : null}
            <TarjetasPendientes compacta />
            <EstaSemana elementos={agenda.semana} />
            {agenda.multidia ? <TarjetaMultidia plan={agenda.multidia} hoy={hoy} /> : null}
            {actividad.lugar ? <UltimoLugar sitio={actividad.lugar} fecha={actividad.fechaLugar} emoji={actividad.emoji} /> : null}
            <UltimosMovimientos movimientos={actividad.movimientos} pareja={pareja} />
            {estado.primerosPasos ? <PrimerosPasos hechos={pasos.hechos} /> : null}
            {__DEV__ ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/laboratorio')}
                style={({ pressed }) => [styles.boton, pressed && styles.pulsado]}
              >
                <Text style={styles.texto}>Ver animaciones del hilo</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </Animated.ScrollView>
      {saldando ? <HojaSaldar onCerrar={() => setSaldando(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colors.background },
  contenido: { paddingHorizontal: 20, paddingTop: spacing.md, paddingBottom: 100, gap: spacing.lg },
  vacio: { alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 12 },
  vacioTexto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary, textAlign: 'center' },
  boton: { height: 52, borderRadius: radius.full, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  pulsado: { backgroundColor: colors.accentDark },
  texto: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.white },
});
