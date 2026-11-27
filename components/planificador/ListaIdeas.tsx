import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { HojaConfirmar } from '@/components/gastos/HojaConfirmar';
import { EmojiIcono } from '@/components/mapa/EmojiIcono';
import { BotonSecundario } from '@/components/onboarding/Botones';
import { HojaIdea } from '@/components/planificador/HojaIdea';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { ErrorGasto } from '@/lib/gastos/error';
import { personas } from '@/lib/gastos/personas';
import { ERROR_GENERICO } from '@/lib/mapa/error';
import type { Pareja } from '@/lib/pareja/EstadoProvider';
import { borrarIdea } from '@/lib/planificador/consultasIdeas';
import { type Idea, etiquetaIdea, iconoDeIdea, ordenarIdeas, textoIdea } from '@/lib/planificador/ideas';
import { parametrosDeIdea } from '@/lib/planificador/precarga';
import { useIdeas, useInvalidarPlanificador } from '@/lib/planificador/usePlanificador';

type Hoja = { tipo: 'nueva' } | { tipo: 'editar'; idea: Idea } | { tipo: 'borrar'; idea: Idea };

/** Pestaña «Ideas» (mockup Planificador): ideas sin fecha, «Convertir en plan» y «+ Idea». */
export function ListaIdeas({ pareja, onScroll }: { pareja: Pareja; onScroll: React.ComponentProps<typeof Animated.ScrollView>['onScroll'] }) {
  const colors = useColores();
  const styles = useStyles();
  const router = useRouter();
  const invalidar = useInvalidarPlanificador();
  const consulta = useIdeas();
  const p = personas(pareja, colors);
  const [hoja, setHoja] = useState<Hoja | null>(null);
  const [recargando, setRecargando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);
  const cerrar = () => {
    setHoja(null);
    setErrorBorrar(null);
  };

  const recargar = async () => {
    setRecargando(true);
    await consulta.refetch();
    setRecargando(false);
  };

  const borrar = async (i: Idea) => {
    setBorrando(true);
    setErrorBorrar(null);
    try {
      await borrarIdea(i.id);
      await invalidar();
      cerrar();
    } catch (e) {
      setErrorBorrar(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
    } finally {
      setBorrando(false);
    }
  };

  if (consulta.isError && !consulta.data) {
    return (
      <View style={styles.centro}>
        <Text style={styles.vacioTexto}>No se han podido cargar las ideas.</Text>
        <BotonSecundario etiqueta="Reintentar" onPress={() => consulta.refetch()} />
      </View>
    );
  }
  if (consulta.isLoading) return null;

  const ideas = ordenarIdeas(consulta.data ?? []);
  return (
    <>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={recargar} tintColor={colors.accent} />}
        contentContainerStyle={styles.lista}
      >
        <Text style={styles.intro}>Ideas sin fecha para cuando os apetezca.</Text>
        {ideas.length === 0 ? (
          <View style={styles.vacio}>
            <Ionicons name="bulb-outline" size={44} color={colors.accent} />
            <Text accessibilityRole="header" style={styles.vacioTitulo}>
              Aún no hay ideas
            </Text>
            <Text style={styles.vacioTexto}>Apuntad lo que os apetezca hacer algún día; cuando tenga fecha, lo convertís en plan.</Text>
          </View>
        ) : null}
        {ideas.map((i) => (
          <View key={i.id} style={styles.tarjeta}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={etiquetaIdea(i)}
              accessibilityHint="Abre la idea para editarla"
              onPress={() => setHoja({ tipo: 'editar', idea: i })}
              style={({ pressed }) => [styles.cabecera, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.baldosa}>
                <EmojiIcono emoji={iconoDeIdea(i)} size={26} />
              </View>
              <View style={styles.textos}>
                <Text style={styles.titulo} numberOfLines={2}>
                  {i.title}
                </Text>
                <Text style={styles.tipo}>{textoIdea(i)}</Text>
              </View>
            </Pressable>
            <BotonSecundario
              etiqueta="Convertir en plan"
              onPress={() => router.push({ pathname: '/planificador/nuevo', params: parametrosDeIdea(i) })}
            />
          </View>
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel="Añadir idea" onPress={() => setHoja({ tipo: 'nueva' })} style={styles.anadir}>
          <Text style={styles.anadirTexto}>+ Idea</Text>
        </Pressable>
      </Animated.ScrollView>

      {hoja?.tipo === 'nueva' || hoja?.tipo === 'editar' ? (
        <HojaIdea
          key={hoja.tipo === 'editar' ? hoja.idea.id : 'nueva'}
          coupleId={pareja.coupleId}
          nombrePareja={p.nombrePareja}
          idea={hoja.tipo === 'editar' ? hoja.idea : undefined}
          onBorrar={hoja.tipo === 'editar' ? () => setHoja({ tipo: 'borrar', idea: hoja.idea }) : undefined}
          onCerrar={cerrar}
        />
      ) : null}
      {hoja?.tipo === 'borrar' ? (
        <HojaConfirmar
          titulo="¿Borrar esta idea?"
          texto={`Se borrará «${hoja.idea.title}» para los dos. No hace falta que ${p.nombrePareja} lo apruebe, pero no se puede deshacer.`}
          etiqueta="Borrar idea"
          ocupado={borrando}
          error={errorBorrar}
          onConfirmar={() => borrar(hoja.idea)}
          onCerrar={cerrar}
        />
      ) : null}
    </>
  );
}

const useStyles = crearEstilos((colors) => ({
  lista: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, gap: 12 },
  intro: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32, paddingBottom: 60 },
  vacio: { alignItems: 'center', gap: 12, paddingVertical: 32, paddingHorizontal: 12 },
  vacioTitulo: { fontFamily: fonts.title, fontSize: 22, color: colors.text, textAlign: 'center' },
  vacioTexto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary, textAlign: 'center' },
  tarjeta: { gap: 12, padding: 14, borderRadius: radius.xl - 4, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  baldosa: { width: 48, height: 48, borderRadius: radius.lg, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  textos: { flex: 1, minWidth: 0, gap: 2 },
  titulo: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  tipo: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  anadir: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg - 2, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.inputBorder },
  anadirTexto: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.icon },
}));
