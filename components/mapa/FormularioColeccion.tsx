import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SelectorIcono } from '@/components/SelectorIcono';
import { BorrarGasto } from '@/components/gastos/BorrarGasto';
import { Grupo, Interruptor } from '@/components/gastos/Controles';
import { PinSitio } from '@/components/mapa/PinSitio';
import { SitiosMarcables } from '@/components/mapa/SitiosMarcables';
import { BotonPrincipal } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, radius } from '@/constants/theme';
import { ErrorGasto } from '@/lib/gastos/error';
import { personas } from '@/lib/gastos/personas';
import {
  MAX_NOMBRE_COLECCION,
  esDePlan,
  hayErroresColeccion,
  puedeCambiarVisibilidad,
  validarColeccion,
} from '@/lib/mapa/colecciones';
import { crearColeccion, editarColeccion } from '@/lib/mapa/consultasColecciones';
import { ERROR_GENERICO } from '@/lib/mapa/error';
import type { Coleccion } from '@/lib/mapa/tipos';
import { useInvalidarMapa, useSitios } from '@/lib/mapa/useSitios';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

const ICONO_INICIAL = '⭐';

/**
 * Crear o editar una colección (mockup NuevaColeccion): nombre, icono (12 sugeridos u «Otro…» con el teclado de emojis),
 * vista previa del pin, sitios que añadir ahora (solo al crear) e interruptor de visibilidad.
 * `coleccion`: la que se edita. `sitioInicial`: sitio que llega marcado (desde la ficha).
 */
export function FormularioColeccion({ pareja, coleccion, sitioInicial }: { pareja: Pareja; coleccion?: Coleccion; sitioInicial?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const invalidar = useInvalidarMapa();
  const { data: sitios = [] } = useSitios();
  const p = personas(pareja);
  const editando = !!coleccion;
  const [nombre, setNombre] = useState(coleccion?.name ?? '');
  const [icono, setIcono] = useState(coleccion?.icon ?? ICONO_INICIAL);
  const [elegidos, setElegidos] = useState<string[]>(() => (sitioInicial ? [sitioInicial] : []));
  const [visible, setVisible] = useState(coleccion?.visible_to_partner ?? true);
  const [intentado, setIntentado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Id fijado al abrir: reintentar tras un fallo de red no duplica la colección.
  const [id] = useState(() => coleccion?.id ?? Crypto.randomUUID());

  const errores = validarColeccion({ nombre, icono });
  const puedeVisibilidad = !editando || puedeCambiarVisibilidad(coleccion, pareja.yo.userId);

  const cerrar = () => (router.canGoBack() ? router.back() : router.replace('/mapa'));
  const alternarSitio = (sitioId: string) => setElegidos((x) => (x.includes(sitioId) ? x.filter((i) => i !== sitioId) : [...x, sitioId]));

  const guardar = async () => {
    setIntentado(true);
    if (hayErroresColeccion(errores)) return;
    setOcupado(true);
    setError(null);
    try {
      if (coleccion) {
        const cambios: Parameters<typeof editarColeccion>[2] = {};
        if (nombre.trim() !== coleccion.name) cambios.name = nombre.trim();
        if (icono !== coleccion.icon) cambios.icon = icono;
        if (visible !== coleccion.visible_to_partner) cambios.visible_to_partner = visible;
        if (Object.keys(cambios).length > 0) await editarColeccion(coleccion.id, coleccion.version, cambios, p.nombrePareja);
      } else {
        await crearColeccion(id, pareja.coupleId, { nombre, icono, visible: p.otra ? visible : true }, elegidos);
      }
      await invalidar();
      cerrar();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
      if (e instanceof ErrorGasto && e.codigo === 'version') await invalidar();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <View style={styles.raiz}>
      <View style={[styles.cabecera, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={cerrar} style={styles.cerrar}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.titulo}>
          {editando ? 'Editar colección' : 'Nueva colección'}
        </Text>
        <View style={styles.cerrarHueco} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.contenido}
      >
        {coleccion && esDePlan(coleccion) ? (
          <Text style={styles.nota}>Esta colección es la de un plan: su nombre y su icono los pone el plan, y se borra con él.</Text>
        ) : (
          <>
            {coleccion ? <BorrarGasto gasto={{ id: coleccion.id, visible_to_partner: coleccion.visible_to_partner, name: coleccion.name }} pareja={pareja} tipo="collection" parte="banda" /> : null}
            <Grupo etiqueta="Nombre">
              <TextInput
                accessibilityLabel="Nombre"
                value={nombre}
                onChangeText={setNombre}
                maxLength={MAX_NOMBRE_COLECCION}
                placeholder="Ramen, Escapadas, Planes de lluvia…"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="sentences"
                returnKeyType="done"
                style={styles.campo}
              />
              <MensajeError texto={intentado ? errores.nombre : null} />
            </Grupo>

            <SelectorIcono etiqueta="Icono de la colección" valor={icono} onCambiar={setIcono} error={intentado ? errores.icono : null} />

            <Grupo etiqueta="Así se verá en el mapa">
              <View style={styles.vista}>
                <View style={styles.vistaPin}>
                  <PinSitio categoria="other" estado="want_to_go" emoji={icono} tamano={40} conPico />
                  <Text style={styles.nota}>Quiero ir</Text>
                </View>
                <View style={styles.vistaPin}>
                  <PinSitio categoria="other" estado="been" emoji={icono} tamano={40} conPico />
                  <Text style={styles.nota}>Hemos ido</Text>
                </View>
              </View>
            </Grupo>

            {!editando && sitios.length > 0 ? (
              <Grupo etiqueta="Añadir sitios ahora">
                <SitiosMarcables sitios={sitios} elegidos={elegidos} onAlternar={alternarSitio} />
              </Grupo>
            ) : null}

            {p.otra && puedeVisibilidad ? (
              <Interruptor
                titulo={`Visible para ${p.nombrePareja}`}
                ayuda={visible ? `${p.nombrePareja} la verá y podrá añadir sitios.` : 'Solo la ves tú. Ideal para sorpresas.'}
                valor={visible}
                onCambiar={setVisible}
              />
            ) : null}
            {p.otra && editando && !puedeVisibilidad && !esDePlan(coleccion) && coleccion.visible_to_partner ? (
              <Text style={styles.nota}>Una colección compartida no puede volver a ser privada.</Text>
            ) : null}

            <MensajeError texto={error} />
            {coleccion ? <BorrarGasto gasto={{ id: coleccion.id, visible_to_partner: coleccion.visible_to_partner, name: coleccion.name }} pareja={pareja} tipo="collection" parte="pie" /> : null}
          </>
        )}
      </ScrollView>

      {!coleccion || !esDePlan(coleccion) ? (
        <View style={[styles.pie, { paddingBottom: insets.bottom + 16 }]}>
          <BotonPrincipal etiqueta={editando ? 'Guardar cambios' : 'Crear colección'} cargando={ocupado} onPress={guardar} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colors.background },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  cerrar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cerrarHueco: { width: 44 },
  titulo: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  contenido: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, gap: 14 },
  campo: { height: 50, paddingHorizontal: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.white, fontFamily: fonts.body, fontSize: 16, color: colors.text },
  nota: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  vista: { flexDirection: 'row', justifyContent: 'space-around', padding: 16, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  vistaPin: { alignItems: 'center', gap: 6 },
  pie: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
});
