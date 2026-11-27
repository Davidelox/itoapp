import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Grupo } from '@/components/gastos/Controles';
import { Hoja } from '@/components/gastos/Hoja';
import { BotonPrincipal, BotonSecundario } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { Segmentado } from '@/components/onboarding/OpcionRadio';
import { BuscarLugarNuevo } from '@/components/mapa/BuscarLugarNuevo';
import { PinSitio } from '@/components/mapa/PinSitio';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { personas } from '@/lib/gastos/personas';
import { avisarSitioPrivado, buscarEnSitios, nombreDeSitio } from '@/lib/mapa/conexiones';
import { editarSitio } from '@/lib/mapa/consultas';
import { etiquetaAccesible, textoSecundario } from '@/lib/mapa/lista';
import { useInvalidarMapa, useSitios } from '@/lib/mapa/useSitios';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/**
 * Fila «Sitio (opcional)» de los formularios de evento y de gasto (docs/plan-mapa.md F7): abre una hoja con los sitios
 * guardados que ve esta persona, con búsqueda local y la opción «Sin sitio». Con `compartido` (lo ve la pareja) y un
 * sitio privado enlazado, avisa y ofrece hacerlo visible o dejarlo así.
 */
export function CampoSitio({ valor, onCambiar, compartido = false }: { valor: string | null; onCambiar: (id: string | null) => void; compartido?: boolean }) {
  const colors = useColores();
  const styles = useStyles();
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState('');
  const [modo, setModo] = useState<'guardados' | 'nuevo'>('guardados');
  const { data: sitios, isLoading, isError } = useSitios();
  const { pareja } = useEstado();
  const invalidar = useInvalidarMapa();
  // Sitio privado para el que el usuario ha elegido «Dejarlo así» (se guarda enlazado sin hacerlo visible).
  const [dejado, setDejado] = useState<string | null>(null);
  const [revelando, setRevelando] = useState(false);
  const [errorRevelar, setErrorRevelar] = useState<string | null>(null);
  const enlazado = sitios?.find((s) => s.id === valor);
  const nombrePareja = pareja ? personas(pareja, colors).nombrePareja : 'Tu pareja';
  const avisar = !!enlazado && dejado !== enlazado.id && avisarSitioPrivado(enlazado, compartido, !!pareja?.otra);
  // Un sitio enlazado que esta persona no ve (borrado o privado de su pareja) sale como «no disponible».
  const nombre = nombreDeSitio(sitios, valor) ?? (valor && sitios ? 'Sitio no disponible' : null);
  const lista = buscarEnSitios(sitios ?? [], texto);
  const cerrar = () => {
    setAbierta(false);
    setTexto('');
    setModo('guardados');
  };
  const revelar = async () => {
    if (!enlazado) return;
    setRevelando(true);
    setErrorRevelar(null);
    try {
      await editarSitio(enlazado.id, enlazado.version, { visible_to_partner: true }, nombrePareja);
      await invalidar();
    } catch (e) {
      // Incluye el 23505 («Ya está en vuestro mapa») ya traducido por `lib/mapa/error.ts`.
      setErrorRevelar(e instanceof Error ? e.message : 'No se ha podido hacer visible. Inténtalo de nuevo.');
    } finally {
      setRevelando(false);
    }
  };
  const elegir = (id: string | null) => {
    setErrorRevelar(null);
    onCambiar(id);
    cerrar();
  };

  return (
    <Grupo etiqueta="Sitio (opcional)">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sitio: ${nombre ?? 'sin sitio'}`}
        accessibilityHint="Abre la lista de sitios guardados"
        onPress={() => setAbierta(true)}
        style={styles.boton}
      >
        <Ionicons name="location-outline" size={20} color={colors.icon} />
        <Text style={[styles.botonTexto, !nombre && styles.vacio]} numberOfLines={1}>
          {nombre ?? 'Sin sitio'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </Pressable>
      {avisar ? (
        <View style={styles.aviso} accessibilityRole="alert">
          <Text style={styles.avisoTitulo}>{nombrePareja} no verá este sitio. ¿Hacerlo visible?</Text>
          <Text style={styles.linea}>No se puede volver a ocultar. Si lo dejas así, {nombrePareja} verá «Sitio no disponible».</Text>
          <MensajeError texto={errorRevelar} />
          <View style={styles.avisoBotones}>
            <View style={styles.avisoBoton}>
              <BotonSecundario etiqueta="Dejarlo así" deshabilitado={revelando} onPress={() => setDejado(enlazado?.id ?? null)} />
            </View>
            <View style={styles.avisoBoton}>
              <BotonPrincipal etiqueta="Hacerlo visible" cargando={revelando} onPress={revelar} />
            </View>
          </View>
        </View>
      ) : null}
      <Hoja visible={abierta} titulo="Elegir sitio" onCerrar={cerrar} desplazable>
        <Segmentado
          etiqueta="Origen del sitio"
          opciones={[
            { valor: 'guardados', etiqueta: 'Guardados' },
            { valor: 'nuevo', etiqueta: 'Buscar lugar nuevo' },
          ]}
          valor={modo}
          onCambiar={setModo}
        />
        {modo === 'nuevo' && pareja ? <BuscarLugarNuevo sitios={sitios ?? []} coupleId={pareja.coupleId} onElegido={elegir} /> : null}
        {modo === 'guardados' ? (
          <>
        <TextInput
          accessibilityLabel="Buscar entre vuestros sitios"
          value={texto}
          onChangeText={setTexto}
          placeholder="Buscar por nombre o dirección"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.campo}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sin sitio"
          accessibilityState={{ selected: valor === null }}
          onPress={() => elegir(null)}
          style={styles.fila}
        >
          <Ionicons name="close-circle-outline" size={24} color={colors.icon} />
          <Text style={styles.nombre}>Sin sitio</Text>
          {valor === null ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
        </Pressable>
        {isLoading ? <Text style={styles.ayuda}>Cargando sitios…</Text> : null}
        {isError ? <Text style={styles.ayuda}>No se han podido cargar los sitios.</Text> : null}
        {!isLoading && !isError && (sitios ?? []).length === 0 ? <Text style={styles.ayuda}>Aún no hay sitios guardados en el Mapa.</Text> : null}
        {!isLoading && (sitios ?? []).length > 0 && lista.length === 0 ? <Text style={styles.ayuda}>Ningún sitio coincide.</Text> : null}
        {lista.map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            accessibilityLabel={etiquetaAccesible(s)}
            accessibilityState={{ selected: s.id === valor }}
            onPress={() => elegir(s.id)}
            style={styles.fila}
          >
            <PinSitio categoria={s.category} estado={s.status} privado={!s.visible_to_partner} tamano={28} />
            <View style={styles.textos}>
              <Text style={styles.nombre} numberOfLines={2}>
                {s.name}
              </Text>
              <Text style={styles.linea} numberOfLines={1}>
                {textoSecundario(s)}
              </Text>
            </View>
            {s.id === valor ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
          </Pressable>
        ))}
          </>
        ) : null}
      </Hoja>
    </Grupo>
  );
}

const useStyles = crearEstilos((colors) => ({
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.card,
  },
  botonTexto: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  vacio: { fontFamily: fonts.body, color: colors.textSecondary },
  campo: {
    height: 50,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.card,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6 },
  textos: { flex: 1, gap: 1 },
  nombre: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  linea: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  aviso: { gap: 6, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface },
  avisoTitulo: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  avisoBotones: { flexDirection: 'row', gap: 8, marginTop: 4 },
  avisoBoton: { flex: 1 },
  ayuda: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, paddingVertical: 8 },
}));
