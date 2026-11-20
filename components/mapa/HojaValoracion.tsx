import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Grupo } from '@/components/gastos/Controles';
import { Hoja } from '@/components/gastos/Hoja';
import { BotonPrincipal } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, radius } from '@/constants/theme';
import { ErrorGasto } from '@/lib/gastos/error';
import { ERROR_GENERICO } from '@/lib/mapa/error';
import { textoValoracionHablado } from '@/lib/mapa/lista';
import type { Sitio } from '@/lib/mapa/tipos';
import { MAX_NOTA, miNota, pasoValoracion, tocarEstrella } from '@/lib/mapa/valoracion';
import { guardarMiNota } from '@/lib/mapa/valoraciones';
import { useInvalidarMapa } from '@/lib/mapa/useSitios';

/** Cinco estrellas táctiles (con media) y, para lector de pantalla, un único control ajustable de 0,5 en 0,5. */
function EstrellasEditables({ valor, onCambiar }: { valor: number | null; onCambiar: (v: number | null) => void }) {
  const v = valor ?? 0;
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Tu valoración"
      accessibilityValue={{ text: valor ? textoValoracionHablado(valor) : 'Sin valorar' }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onCambiar(pasoValoracion(valor, e.nativeEvent.actionName === 'increment' ? 0.5 : -0.5))}
      style={styles.estrellas}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} accessible={false} importantForAccessibility="no" onPress={() => onCambiar(tocarEstrella(valor, n))} hitSlop={4}>
          <Ionicons name={v >= n ? 'star' : v >= n - 0.5 ? 'star-half' : 'star-outline'} size={38} color={colors.paymentDot} />
        </Pressable>
      ))}
    </View>
  );
}

/** Mi valoración y mi nota del sitio. Se monta al abrirla (parte siempre de lo guardado). Vaciar las dos y guardar las borra. */
export function HojaValoracion({ sitio, coupleId, userId, nombrePareja, onCerrar }: { sitio: Sitio; coupleId: string; userId: string; nombrePareja: string | null; onCerrar: () => void }) {
  const invalidar = useInvalidarMapa();
  const mia = miNota(sitio.place_notes, userId);
  const [rating, setRating] = useState<number | null>(mia?.rating ?? null);
  const [nota, setNota] = useState(mia?.note ?? '');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setOcupado(true);
    setError(null);
    try {
      await guardarMiNota(sitio.id, coupleId, userId, rating, nota);
      await invalidar();
      onCerrar();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
    } finally {
      setOcupado(false);
    }
  };

  const quien = sitio.visible_to_partner && nombrePareja ? `${nombrePareja} la verá.` : 'Solo tú la ves.';
  return (
    <Hoja
      visible
      titulo="Tu valoración y nota"
      onCerrar={onCerrar}
      bloqueada={ocupado}
      desplazable
      pie={<BotonPrincipal etiqueta="Guardar" cargando={ocupado} onPress={guardar} />}
    >
      <Grupo etiqueta="Valoración">
        <EstrellasEditables valor={rating} onCambiar={setRating} />
        {rating ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Quitar valoración" onPress={() => setRating(null)} style={styles.quitar}>
            <Text style={styles.quitarTexto}>Quitar valoración</Text>
          </Pressable>
        ) : null}
      </Grupo>
      <Grupo etiqueta={`Nota (${quien})`}>
        <TextInput
          accessibilityLabel="Nota"
          value={nota}
          onChangeText={setNota}
          maxLength={MAX_NOTA}
          multiline
          placeholder="Qué pedir, qué os gustó…"
          placeholderTextColor={colors.textSecondary}
          style={styles.campo}
        />
      </Grupo>
      <MensajeError texto={error} />
    </Hoja>
  );
}

const styles = StyleSheet.create({
  estrellas: { flexDirection: 'row', gap: 6 },
  quitar: { alignSelf: 'flex-start', paddingVertical: 8 },
  quitarTexto: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textSecondary },
  campo: { minHeight: 100, maxHeight: 180, padding: 14, textAlignVertical: 'top', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.white, fontFamily: fonts.body, fontSize: 16, color: colors.text },
});
