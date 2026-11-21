import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Grupo } from '@/components/gastos/Controles';
import { Hoja } from '@/components/gastos/Hoja';
import { SelectorFecha } from '@/components/gastos/SelectorFecha';
import { BotonPrincipal, EnlaceTexto } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import type { Hueco } from '@/lib/calendario/evento';
import { colors, fonts, radius } from '@/constants/theme';
import { ErrorGasto } from '@/lib/gastos/error';
import { hoyISO } from '@/lib/gastos/fechas';
import { anadirVisita, corregirVisita } from '@/lib/mapa/consultas';
import { ERROR_GENERICO } from '@/lib/mapa/error';
import { useInvalidarVisitas } from '@/lib/mapa/useSitios';
import type { SitioDeVisita } from '@/lib/mapa/eventoVisita';
import { MAX_NOTA_VISITA, type Visita, errorFechaVisita } from '@/lib/mapa/visitas';

/**
 * Apuntar o corregir una visita (docs/plan-mapa.md §12): fecha (hoy por defecto, nunca futura) y nota opcional.
 * Con `visita` corrige esa y ofrece «Quitar visita» (`onQuitar` abre la confirmación). Sin ella añade una nueva;
 * `fechaInicial` permite apuntar la fecha sugerida. Se monta al abrirla, así parte siempre de lo guardado.
 */
export function HojaVisita({
  titulo,
  sitio,
  yo,
  coupleId,
  nombrePareja,
  visita,
  fechaInicial,
  onQuitar,
  onCerrar,
}: {
  titulo: string;
  sitio: SitioDeVisita;
  yo: Hueco;
  coupleId: string;
  nombrePareja: string;
  visita?: Visita;
  fechaInicial?: string;
  onQuitar?: () => void;
  onCerrar: () => void;
}) {
  const invalidar = useInvalidarVisitas();
  const hoy = hoyISO();
  const [fecha, setFecha] = useState(visita?.visited_on ?? fechaInicial ?? hoy);
  const [nota, setNota] = useState(visita?.note ?? '');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Id fijado al abrir: reintentar tras un fallo de red no duplica la visita.
  const [id] = useState(() => Crypto.randomUUID());

  const guardar = async () => {
    const malaFecha = errorFechaVisita(fecha, hoy);
    if (malaFecha) return setError(malaFecha);
    setOcupado(true);
    setError(null);
    try {
      if (visita) await corregirVisita(visita.id, visita.version, fecha, nota, nombrePareja);
      else await anadirVisita(id, coupleId, sitio, yo, fecha, nota);
      await invalidar();
      onCerrar();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
      if (e instanceof ErrorGasto && e.codigo === 'version') await invalidar();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Hoja visible titulo={titulo} onCerrar={onCerrar} bloqueada={ocupado} desplazable pie={<BotonPrincipal etiqueta={visita ? 'Guardar cambios' : 'Guardar visita'} cargando={ocupado} onPress={guardar} />}>
      <Grupo etiqueta="Fecha" rol="radiogroup">
        <SelectorFecha valor={fecha} onCambiar={setFecha} modo="gasto" />
      </Grupo>
      <Grupo etiqueta="Nota (opcional)">
        <TextInput
          accessibilityLabel="Nota de la visita"
          value={nota}
          onChangeText={setNota}
          maxLength={MAX_NOTA_VISITA}
          placeholder="Qué tal fue, qué pedisteis…"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="sentences"
          returnKeyType="done"
          style={styles.campo}
        />
      </Grupo>
      <MensajeError texto={error} />
      {visita && onQuitar ? <EnlaceTexto etiqueta="Quitar visita" deshabilitado={ocupado} onPress={onQuitar} /> : null}
    </Hoja>
  );
}

const styles = StyleSheet.create({
  campo: { height: 50, paddingHorizontal: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.white, fontFamily: fonts.body, fontSize: 16, color: colors.text },
});
