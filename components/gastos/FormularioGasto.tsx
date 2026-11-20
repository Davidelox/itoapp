import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, FilaChips, Grupo } from '@/components/gastos/Controles';
import { ControlesReparto } from '@/components/gastos/ControlesReparto';
import { CampoSitio } from '@/components/mapa/CampoSitio';
import { SelectorFecha } from '@/components/gastos/SelectorFecha';
import { BotonNudo } from '@/components/hilo/BotonNudo';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, radius } from '@/constants/theme';
import { leerEuros } from '@/lib/dinero/importe';
import { CATEGORIAS, type Categoria, INFO_CATEGORIA } from '@/lib/gastos/categorias';
import { type AjustesGastos, ErrorGasto, type Gasto, crearGasto, editarGasto, soloCambios } from '@/lib/gastos/consultas';
import { hoyISO } from '@/lib/gastos/fechas';
import { personas } from '@/lib/gastos/personas';
import {
  type Pagador,
  type Reparto,
  aDatos,
  deDatos,
  puedeSerPrivado,
  ocultaProporcional,
  sinProporcionalOculto,
  valoresPorDefecto,
} from '@/lib/gastos/reparto';
import { useInvalidarGastos } from '@/lib/gastos/useGastos';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

const PAUSA_NUDO_MS = 900;
const MAX_CONCEPTO = 120;

/** Importe guardado → texto editable («62,00» → «62,00»; 6200 → «62,00»). */
const importeATexto = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

type Props = {
  pareja: Pareja;
  ajustes: AjustesGastos;
  /** Con un gasto, el formulario edita; sin él, crea uno nuevo. */
  inicial?: Gasto;
  /**
   * `true` justo antes de enviar una edición (la versión que suba a continuación es tuya, no de tu pareja)
   * y `false` si falla, para que vuelva el aviso de cambios de la pareja.
   */
  alGuardarEdicion?: (enCurso: boolean) => void;
};

/** Añadir o editar un gasto (mockup AnadirGasto, docs/plan-gastos.md §3.2 y §3.4). */
export function FormularioGasto({ pareja, ajustes, inicial, alGuardarEdicion }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const invalidar = useInvalidarGastos();
  const p = personas(pareja);
  const yo = p.yo.slot;
  const editando = !!inicial;

  const desdeDatos = inicial ? deDatos(yo, inicial) : null;
  // Un gasto que ya era proporcional conserva su %, aunque los ajustes hayan cambiado después.
  const pctProporcionalM1 =
    inicial?.split_mode === 'proportional' && inicial.split_pct_m1 !== null ? inicial.split_pct_m1 : ajustes.pctProporcionalM1;
  const sinProporcional = ocultaProporcional(pctProporcionalM1, inicial?.split_mode === 'proportional');
  const porDefectoDe = (c: Categoria | null) => {
    const d = valoresPorDefecto(ajustes, c);
    return { ...d, reparto: sinProporcionalOculto(d.reparto, sinProporcional) };
  };
  const porDefecto = porDefectoDe(inicial?.category ?? null);

  const [importe, setImporte] = useState(inicial ? importeATexto(inicial.amount_cents) : '');
  const [concepto, setConcepto] = useState(inicial?.concept ?? '');
  const [categoria, setCategoria] = useState<Categoria | null>(inicial?.category ?? null);
  const [pagador, setPagador] = useState<Pagador>(desdeDatos?.pagador ?? porDefecto.pagador);
  const [reparto, setReparto] = useState<Reparto>(desdeDatos?.reparto ?? porDefecto.reparto);
  // Al editar, el reparto ya lo eligió alguien: la categoría no lo cambia.
  const [repartoTocado, setRepartoTocado] = useState(editando);
  const [pctYo, setPctYo] = useState(desdeDatos?.reparto === 'personalizado' ? desdeDatos.pctYo : 50);
  const [visible, setVisible] = useState(inicial ? inicial.visible_to_partner : ajustes.compartirPersonales);
  const [fecha, setFecha] = useState(inicial?.spent_on ?? hoyISO());
  const [sitioId, setSitioId] = useState<string | null>(inicial?.place_id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);
  // Id del gasto nuevo fijado al abrir: un reintento tras un fallo de red no lo duplica.
  const [idNuevo] = useState(() => Crypto.randomUUID());

  // El bote se ofrece si está activo, o si el gasto que se edita ya lo usa.
  const conBote = ajustes.boteActivo || desdeDatos?.pagador === 'bote' || desdeDatos?.reparto === 'bote';
  const saldado = !!inicial?.settlement_id;
  const soyQuienLoCreo = !inicial || inicial.created_by === p.yo.userId;

  const cents = leerEuros(importe);
  const conceptoLimpio = concepto.trim();
  const datos = aDatos(yo, pagador, reparto, pctYo, pctProporcionalM1);
  const privadoPosible = puedeSerPrivado(pagador, reparto);
  const visibleFinal = privadoPosible ? visible : true;

  const errores = {
    importe: intentado && cents === null ? 'Escribe un importe, por ejemplo 12,50.' : null,
    concepto: intentado && conceptoLimpio === '' ? 'Escribe en qué ha sido el gasto.' : null,
    categoria: intentado && !categoria ? 'Elige una categoría.' : null,
  };
  const completo = cents !== null && conceptoLimpio !== '' && !!categoria;

  const elegirCategoria = (c: Categoria) => {
    setCategoria(c);
    if (!repartoTocado) {
      const d = porDefectoDe(c);
      setPagador(d.pagador);
      setReparto(d.reparto);
    }
  };
  const elegirPagador = (v: Pagador) => {
    setPagador(v);
    setRepartoTocado(true);
  };
  const elegirReparto = (v: Reparto) => {
    setReparto(v);
    setRepartoTocado(true);
  };

  const guardar = async () => {
    setIntentado(true);
    if (!completo || !categoria || cents === null) throw new Error('incompleto');
    setError(null);
    const fila = {
      concept: conceptoLimpio,
      amount_cents: cents,
      category: categoria,
      spent_on: fecha,
      place_id: sitioId,
      ...datos,
      // Solo quien lo creó puede cambiar la visibilidad (TW013): si no, no se envía.
      ...(soyQuienLoCreo ? { visible_to_partner: visibleFinal } : {}),
    };
    try {
      if (inicial) {
        // Solo lo que ha cambiado: no se tocan campos que nadie ha editado (ni salta TW010 en un gasto saldado).
        const cambios = soloCambios(inicial, fila);
        if (Object.keys(cambios).length > 0) {
          alGuardarEdicion?.(true);
          await editarGasto(inicial.id, inicial.version, cambios, p.nombrePareja);
        }
      } else {
        await crearGasto(idNuevo, pareja.coupleId, { ...fila, visible_to_partner: visibleFinal });
      }
    } catch (e) {
      // El sitio ya no está (borrado o privado de tu pareja): se quita la selección.
      if (e instanceof ErrorGasto && e.codigo === 'TW064') setSitioId(null);
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido guardar. Inténtalo de nuevo.');
      alGuardarEdicion?.(false);
      throw e;
    }
  };

  const alTerminar = () => {
    invalidar();
    const id = inicial?.id ?? idNuevo;
    setTimeout(() => {
      if (editando) router.back();
      else router.replace({ pathname: '/gastos/[id]', params: { id } });
    }, PAUSA_NUDO_MS);
  };

  return (
    <KeyboardAvoidingView style={styles.raiz} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.cabecera, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={() => router.back()} style={styles.cerrar}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.titulo}>
          {editando ? 'Editar gasto' : 'Nuevo gasto'}
        </Text>
        <View style={styles.cerrarHueco} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.contenido}>
        {saldado ? (
          <Text style={styles.aviso}>Este gasto ya está saldado: el importe y el reparto no se pueden cambiar.</Text>
        ) : null}

        <View style={styles.importeFila}>
          <TextInput
            accessibilityLabel="Importe en euros"
            value={importe}
            onChangeText={(t) => setImporte(t.replace(/[^0-9.,]/g, ''))}
            placeholder="0,00"
            placeholderTextColor={colors.inputBorder}
            keyboardType="decimal-pad"
            inputMode="decimal"
            editable={!saldado}
            autoFocus={!editando}
            style={styles.importe}
          />
          <Text style={styles.euro} importantForAccessibility="no">
            €
          </Text>
        </View>
        <MensajeError texto={errores.importe} />

        <Grupo etiqueta="Concepto">
          <TextInput
            accessibilityLabel="Concepto"
            value={concepto}
            onChangeText={setConcepto}
            maxLength={MAX_CONCEPTO}
            placeholder="Cena, compra del súper…"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="sentences"
            returnKeyType="done"
            style={styles.campo}
          />
          <MensajeError texto={errores.concepto} />
        </Grupo>

        <Grupo etiqueta="Categoría" rol="radiogroup">
          <FilaChips>
            {CATEGORIAS.map((c) => (
              <Chip key={c} rol="radio" etiqueta={INFO_CATEGORIA[c].nombre} activo={categoria === c} onPress={() => elegirCategoria(c)} />
            ))}
          </FilaChips>
          <MensajeError texto={errores.categoria} />
        </Grupo>

        <ControlesReparto
          pareja={pareja}
          cents={cents}
          pagador={pagador}
          onPagador={elegirPagador}
          reparto={reparto}
          onReparto={elegirReparto}
          pctYo={pctYo}
          onPctYo={setPctYo}
          pctProporcionalM1={pctProporcionalM1}
          sinProporcional={sinProporcional}
          conBote={conBote}
          saldado={saldado}
          visible={visible}
          onVisible={setVisible}
          mostrarVisible={privadoPosible && soyQuienLoCreo}
        />

        <Grupo etiqueta="Fecha" rol="radiogroup">
          <SelectorFecha valor={fecha} onCambiar={setFecha} />
        </Grupo>

        <CampoSitio valor={sitioId} onCambiar={setSitioId} compartido={visibleFinal} />

        <MensajeError texto={error} />
      </ScrollView>

      <View style={[styles.pie, { paddingBottom: insets.bottom + 16 }]}>
        <BotonNudo
          label={editando ? 'Guardar cambios' : 'Guardar gasto'}
          labelHecho="Guardado"
          labelError="No se ha podido guardar"
          onPress={guardar}
          onHecho={alTerminar}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colors.background },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  cerrar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cerrarHueco: { width: 44 },
  titulo: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  contenido: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, gap: 14 },
  aviso: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 12,
  },
  importeFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  importe: { minWidth: 120, maxWidth: 240, height: 64, textAlign: 'right', fontFamily: fonts.title, fontSize: 44, color: colors.text },
  euro: { fontFamily: fonts.title, fontSize: 44, color: colors.text },
  campo: {
    height: 50,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.white,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
  },
  pie: { backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 20, paddingTop: 12 },
});
