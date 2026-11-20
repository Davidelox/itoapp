import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { HojaComoLlegar } from '@/components/mapa/HojaComoLlegar';
import { colors, fonts, radius } from '@/constants/theme';
import { ErrorGasto } from '@/lib/gastos/error';
import { type SitioBuscado } from '@/lib/mapa/busqueda';
import { INFO_CATEGORIA_SITIO } from '@/lib/mapa/categorias';
import { ERROR_GENERICO } from '@/lib/mapa/error';
import { fusionarConGuardados, lineaResultado, paramsGuardar } from '@/lib/mapa/resultados';
import type { Sitio } from '@/lib/mapa/tipos';
import type { useBusquedaMapa } from '@/lib/mapa/useBusquedaMapa';

type Busqueda = ReturnType<typeof useBusquedaMapa>;

/**
 * Búsqueda dentro del mapa (flotante): barra arriba, resultados como lista inferior (siempre en lista, también para el
 * lector de pantalla) y tarjeta del elegido con «Guardar» / «Ya está en vuestro mapa» y «Cómo llegar». Los pines van en `MapaSitios`.
 */
export function BuscadorMapa({ b, sitios, sinLista = false }: { b: Busqueda; sitios: Sitio[]; sinLista?: boolean }) {
  const router = useRouter();
  const [llegar, setLlegar] = useState(false);
  const filas = useMemo(() => fusionarConGuardados([...(b.resultados ?? []), ...(b.extra ? [b.extra] : [])], sitios), [b.resultados, b.extra, sitios]);
  const elegido = filas.find((f) => f.resultado.provider_place_id === b.seleccionado) ?? null;
  const hayResultados = filas.length > 0;
  const vacio = b.activa && !b.cargando && !b.error && b.resultados !== undefined && filas.length === 0;

  return (
    <>
      <View style={styles.arriba} pointerEvents="box-none">
        <View style={styles.barra}>
          <Ionicons name="search" size={18} color={colors.icon} />
          <TextInput
            accessibilityLabel="Buscar sitios en el mapa"
            value={b.escrito}
            onChangeText={b.escribir}
            onSubmitEditing={b.enviar}
            onBlur={b.cerrarSugerencias}
            maxLength={100}
            placeholder="Buscar en el mapa"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.campo}
          />
          {b.escrito !== '' || b.activa ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar búsqueda" onPress={b.limpiar} hitSlop={10} style={styles.cerrar}>
              <Ionicons name="close-circle" size={20} color={colors.icon} />
            </Pressable>
          ) : null}
        </View>
        {b.sugerencias.length > 0 ? (
          <View style={styles.sugerencias} accessibilityRole="list" accessibilityLabel="Sugerencias de búsqueda">
            <Text style={styles.oculto} accessibilityLiveRegion="polite">{`${b.sugerencias.length} sugerencias`}</Text>
            {b.sugerencias.map((s) => (
              <Pressable
                key={s.provider_place_id}
                accessibilityRole="button"
                accessibilityLabel={`${s.nombre}${lineaResultado(s) ? `, ${lineaResultado(s)}` : ''}`}
                onPress={() => b.elegirSugerencia(s)}
                style={({ pressed }) => [styles.sugerencia, pressed && { backgroundColor: colors.surface }]}
              >
                <Ionicons name={INFO_CATEGORIA_SITIO[s.categoria].icono} size={18} color={colors.accent} />
                <View style={styles.textos}>
                  <Text style={styles.filaNombre} numberOfLines={1}>
                    {s.nombre}
                  </Text>
                  {lineaResultado(s) ? (
                    <Text style={styles.nota} numberOfLines={1}>
                      {lineaResultado(s)}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
        {b.cargando && b.sugerencias.length === 0 ? (
          <View style={styles.aviso} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.nota}>Buscando…</Text>
          </View>
        ) : b.error ? (
          <View style={styles.aviso} accessibilityRole="alert">
            <Text style={styles.nota}>{b.error instanceof ErrorGasto ? b.error.message : ERROR_GENERICO}</Text>
          </View>
        ) : vacio ? (
          <View style={styles.aviso} accessibilityLiveRegion="polite">
            <Text style={styles.nota}>No hay resultados. Prueba con otro nombre o mueve el mapa.</Text>
          </View>
        ) : null}
        {b.activa && b.movido && !b.cargando ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Buscar en esta zona" onPress={b.enEstaZona} style={({ pressed }) => [styles.zona, pressed && { opacity: 0.85 }]}>
            <Ionicons name="refresh" size={16} color={colors.white} />
            <Text style={styles.zonaTexto}>Buscar en esta zona</Text>
          </Pressable>
        ) : null}
      </View>

      {hayResultados && !sinLista ? (
        <View style={styles.abajo} pointerEvents="box-none">
          <Text style={styles.atribucion}>Datos © OpenStreetMap</Text>
          {elegido ? (
            <View style={styles.tarjeta}>
              <View style={styles.cabecera}>
                <View style={styles.textos}>
                  <Text accessibilityRole="header" style={styles.nombre} numberOfLines={2}>
                    {elegido.resultado.nombre}
                  </Text>
                  <Text style={styles.nota} numberOfLines={2}>
                    {[INFO_CATEGORIA_SITIO[elegido.resultado.categoria].etiqueta, lineaResultado(elegido.resultado)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Volver a la lista de resultados" onPress={b.deseleccionar} hitSlop={10} style={styles.cerrar}>
                  <Ionicons name="close" size={20} color={colors.icon} />
                </Pressable>
              </View>
              {elegido.guardado ? <Text style={styles.yaEsta}>Ya está en vuestro mapa</Text> : null}
              <View style={styles.botones}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Cómo llegar a ${elegido.resultado.nombre}`} onPress={() => setLlegar(true)} style={({ pressed }) => [styles.boton, styles.botonClaro, pressed && { backgroundColor: colors.border }]}>
                  <Text style={[styles.botonTexto, { color: colors.text }]}>Cómo llegar</Text>
                </Pressable>
                {elegido.guardado ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Ver ficha de ${elegido.guardado.name}`}
                    onPress={() => router.push({ pathname: '/mapa/sitio/[id]', params: { id: (elegido.guardado as Sitio).id } })}
                    style={({ pressed }) => [styles.boton, pressed && { backgroundColor: colors.accentDark }]}
                  >
                    <Text style={styles.botonTexto}>Ver ficha</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Guardar ${elegido.resultado.nombre}`}
                    onPress={() => router.push({ pathname: '/mapa/nuevo', params: paramsGuardar(elegido.resultado) })}
                    style={({ pressed }) => [styles.boton, pressed && { backgroundColor: colors.accentDark }]}
                  >
                    <Text style={styles.botonTexto}>Guardar</Text>
                  </Pressable>
                )}
              </View>
              <HojaComoLlegar sitio={{ name: elegido.resultado.nombre, lat: elegido.resultado.lat, lng: elegido.resultado.lng }} visible={llegar} onCerrar={() => setLlegar(false)} />
            </View>
          ) : (
            <>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={filas}
                keyExtractor={(f) => f.resultado.provider_place_id}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.carrusel}
                accessibilityLabel="Resultados de la búsqueda"
                renderItem={({ item, index }) => <FilaResultado r={item.resultado} numero={index + 1} guardado={!!item.guardado} onPress={() => b.elegir(item.resultado.provider_place_id)} />}
              />
            </>
          )}
        </View>
      ) : null}
    </>
  );
}

function FilaResultado({ r, numero, guardado, onPress }: { r: SitioBuscado; numero: number; guardado: boolean; onPress: () => void }) {
  const linea = lineaResultado(r);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${numero}. ${r.nombre}${linea ? `, ${linea}` : ''}${guardado ? ', ya está en vuestro mapa' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.fila, pressed && { backgroundColor: colors.surface }]}
    >
      <View style={styles.numero}>
        <Text style={styles.numeroTexto}>{numero}</Text>
      </View>
      <View style={styles.textos}>
        <Text style={styles.filaNombre} numberOfLines={1}>
          {r.nombre}
        </Text>
        {linea ? (
          <Text style={styles.nota} numberOfLines={2}>
            {linea}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const sombra = { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 } as const;

const styles = StyleSheet.create({
  // A la derecha queda el botón «Mi ubicación» del mapa (48 px + 16 de margen).
  arriba: { position: 'absolute', top: 16, left: 16, right: 76, gap: 8 },
  barra: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingHorizontal: 14, borderRadius: 24, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, ...sombra },
  campo: { flex: 1, height: 48, fontFamily: fonts.body, fontSize: 16, color: colors.text },
  cerrar: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  sugerencias: { borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...sombra },
  sugerencia: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  oculto: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  nota: { flexShrink: 1, fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  zona: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: radius.full, backgroundColor: colors.accent, ...sombra },
  zonaTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.white },
  abajo: { position: 'absolute', left: 0, right: 0, bottom: 16, gap: 6 },
  atribucion: { alignSelf: 'flex-end', marginRight: 16, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.85)', fontFamily: fonts.body, fontSize: 11, color: colors.text },
  carrusel: { paddingHorizontal: 16, gap: 8 },
  fila: { width: 250, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, ...sombra },
  numero: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  numeroTexto: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.white },
  textos: { flex: 1, minWidth: 0, gap: 2 },
  filaNombre: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  tarjeta: { marginHorizontal: 16, gap: 10, padding: 14, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...sombra },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nombre: { fontFamily: fonts.title, fontSize: 18, color: colors.text },
  yaEsta: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.accent },
  botones: { flexDirection: 'row', gap: 8 },
  botonClaro: { backgroundColor: colors.surface },
  boton: { flex: 1, minHeight: 44, borderRadius: radius.full, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.white },
});
