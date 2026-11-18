import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput } from 'react-native';

import { Chip, FilaChips, Grupo } from '@/components/gastos/Controles';
import { ControlesReparto } from '@/components/gastos/ControlesReparto';
import { Hoja } from '@/components/gastos/Hoja';
import { BotonPrincipal, BotonSecundario } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, radius } from '@/constants/theme';
import { crearGastoDeEvento, descartarQuienPago } from '@/lib/calendario/consultas';
import {
  type EventoParaGasto,
  avisoSecretoCompartido,
  datosGasto,
  textoSecretoPrivado,
  valoresIniciales,
} from '@/lib/calendario/quienPago';
import { leerEuros } from '@/lib/dinero/importe';
import { CATEGORIAS, type Categoria, INFO_CATEGORIA } from '@/lib/gastos/categorias';
import { ErrorGasto } from '@/lib/gastos/consultas';
import { hoyISO } from '@/lib/gastos/fechas';
import { personas } from '@/lib/gastos/personas';
import {
  type Pagador,
  type Reparto,
  ocultaProporcional,
  puedeSerPrivado,
  sinProporcionalOculto,
  valoresPorDefecto,
} from '@/lib/gastos/reparto';
import { useAjustesGastos, useInvalidarGastos } from '@/lib/gastos/useGastos';
import type { Pareja } from '@/lib/pareja/EstadoProvider';
import { useEstado } from '@/lib/pareja/EstadoProvider';

type Props = {
  evento: EventoParaGasto;
  pareja: Pareja;
  /**
   * `pregunta`: responde a «¿Quién pagó?» (el gasto usa el id del evento, hay «No hubo gasto»).
   * `anadir`: un gasto más de un evento que no pregunta (id propio, sin «No hubo gasto»).
   */
  modo: 'pregunta' | 'anadir';
  onCerrar: () => void;
  /** Tras guardar el gasto o descartar la pregunta (la hoja ya ha recargado los datos). */
  onHecho: (resultado: 'gasto' | 'descartado') => void;
};

/**
 * Hoja «¿Quién pagó?» (docs/plan-calendario.md §2): crea el gasto enlazado al evento con los mismos controles que
 * «Nuevo gasto». Se monta al abrirla (cada apertura parte de los valores del evento) y se cierra desmontándola.
 */
export function HojaQuienPago(props: Props) {
  const ajustes = useAjustesGastos();
  if (!ajustes.data) {
    return (
      <Hoja visible titulo={props.modo === 'pregunta' ? '¿Quién pagó?' : 'Añadir gasto'} onCerrar={props.onCerrar}>
        {ajustes.isError ? (
          <Text style={styles.ayuda}>No se han podido cargar los ajustes. Cierra e inténtalo de nuevo.</Text>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </Hoja>
    );
  }
  return <Contenido {...props} ajustes={ajustes.data} />;
}

function Contenido({
  evento,
  pareja,
  modo,
  onCerrar,
  onHecho,
  ajustes,
}: Props & { ajustes: NonNullable<ReturnType<typeof useAjustesGastos>['data']> }) {
  const { userId } = useEstado();
  const invalidar = useInvalidarGastos();
  const p = personas(pareja);
  const yo = p.yo.slot;
  const inicial = valoresIniciales(evento, ajustes, hoyISO());
  const sinProporcional = ocultaProporcional(ajustes.pctProporcionalM1, false);
  const porDefectoDe = (c: Categoria) => {
    const d = valoresPorDefecto(ajustes, c);
    return { ...d, reparto: sinProporcionalOculto(d.reparto, sinProporcional) };
  };

  const [importe, setImporte] = useState(inicial.importe);
  const [categoria, setCategoria] = useState<Categoria>(inicial.categoria);
  const [pagador, setPagador] = useState<Pagador>(inicial.pagador);
  const [reparto, setReparto] = useState<Reparto>(inicial.reparto);
  // Hasta que se toca «¿Quién pagó?» o «¿De quién es?», la categoría cambia el reparto (como en «Nuevo gasto»).
  // Un evento secreto ya parte de «Solo tú» a propósito: la categoría no lo cambia.
  const [repartoTocado, setRepartoTocado] = useState(evento.is_secret);
  const [pctYo, setPctYo] = useState(50);
  const [visible, setVisible] = useState(inicial.visible);
  const [intentado, setIntentado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Id del gasto: con la pregunta es el del evento (si responden los dos a la vez, solo entra uno). Con
  // «Añadir gasto», uno nuevo fijado al abrir la hoja: un reintento tras un fallo de red no lo duplica.
  const [idGasto] = useState(() => (modo === 'pregunta' ? evento.id : Crypto.randomUUID()));

  const cents = leerEuros(importe);
  const conBote = ajustes.boteActivo || pagador === 'bote' || reparto === 'bote';
  const privadoPosible = puedeSerPrivado(pagador, reparto);
  const visibleFinal = privadoPosible ? visible : true;
  const errorImporte = intentado && cents === null ? 'Escribe un importe, por ejemplo 60 o 12,50.' : null;

  const elegirCategoria = (c: Categoria) => {
    setCategoria(c);
    if (!repartoTocado) {
      const d = porDefectoDe(c);
      setPagador(d.pagador);
      setReparto(d.reparto);
    }
  };

  const guardar = async () => {
    setIntentado(true);
    if (cents === null || !userId) return;
    setOcupado(true);
    setError(null);
    try {
      const datos = datosGasto({
        eventoId: evento.id,
        cents,
        concepto: inicial.concepto,
        categoria,
        fecha: inicial.fecha,
        yo,
        pagador,
        reparto,
        pctYo,
        pctProporcionalM1: ajustes.pctProporcionalM1,
        visible,
      });
      await crearGastoDeEvento(idGasto, pareja.coupleId, userId, datos, p.nombrePareja);
      onHecho('gasto');
      invalidar();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido guardar. Inténtalo de nuevo.');
      // Ya apuntado por la pareja o el evento ya no existe: recarga para que la tarjeta desaparezca.
      if (e instanceof ErrorGasto && (e.codigo === '23505' || e.codigo === 'TW060')) invalidar();
    } finally {
      setOcupado(false);
    }
  };

  const sinGasto = async () => {
    setOcupado(true);
    setError(null);
    try {
      await descartarQuienPago(evento.id);
      onHecho('descartado');
      invalidar();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido guardar. Inténtalo de nuevo.');
      if (e instanceof ErrorGasto && e.codigo === 'TW060') invalidar();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Hoja
      visible
      titulo={modo === 'pregunta' ? '¿Quién pagó?' : 'Añadir gasto'}
      onCerrar={onCerrar}
      bloqueada={ocupado}
      desplazable
      pie={
        <>
          <BotonPrincipal etiqueta="Guardar gasto" etiquetaCargando="Guardando…" cargando={ocupado} onPress={guardar} />
          {modo === 'pregunta' ? <BotonSecundario etiqueta="No hubo gasto" deshabilitado={ocupado} onPress={sinGasto} /> : null}
        </>
      }
    >
      <Text style={styles.ayuda} numberOfLines={2}>
        {inicial.concepto}
      </Text>

      <Grupo etiqueta="Importe">
        <TextInput
          accessibilityLabel="Importe en euros"
          value={importe}
          onChangeText={(t) => setImporte(t.replace(/[^0-9.,]/g, ''))}
          placeholder="0,00 €"
          placeholderTextColor={colors.textSecondary}
          keyboardType="decimal-pad"
          inputMode="decimal"
          returnKeyType="done"
          style={styles.campo}
        />
        {inicial.importe !== '' ? <Text style={styles.ayuda}>Precargado con el presupuesto. Puedes cambiarlo.</Text> : null}
        <MensajeError texto={errorImporte} />
      </Grupo>

      <Grupo etiqueta="Categoría" rol="radiogroup">
        <FilaChips>
          {CATEGORIAS.map((c) => (
            <Chip key={c} rol="radio" etiqueta={INFO_CATEGORIA[c].nombre} activo={categoria === c} onPress={() => elegirCategoria(c)} />
          ))}
        </FilaChips>
      </Grupo>

      <ControlesReparto
        pareja={pareja}
        cents={cents}
        pagador={pagador}
        onPagador={(v) => {
          setPagador(v);
          setRepartoTocado(true);
        }}
        reparto={reparto}
        onReparto={(v) => {
          setReparto(v);
          setRepartoTocado(true);
        }}
        pctYo={pctYo}
        onPctYo={setPctYo}
        pctProporcionalM1={ajustes.pctProporcionalM1}
        sinProporcional={sinProporcional}
        conBote={conBote}
        visible={visible}
        onVisible={setVisible}
        mostrarVisible={privadoPosible}
      />

      {evento.is_secret ? (
        <Text style={styles.avisoSecreto} accessibilityLiveRegion="polite">
          {visibleFinal ? avisoSecretoCompartido(p.nombrePareja) : textoSecretoPrivado(p.nombrePareja)}
        </Text>
      ) : null}

      <MensajeError texto={error} />
    </Hoja>
  );
}

const styles = StyleSheet.create({
  ayuda: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  campo: {
    height: 50,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.text,
  },
  avisoSecreto: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 12,
  },
});
