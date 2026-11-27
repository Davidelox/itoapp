import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { TextInput } from 'react-native';

import { SelectorIcono } from '@/components/SelectorIcono';
import { Chip, FilaChips, Grupo } from '@/components/gastos/Controles';
import { Hoja } from '@/components/gastos/Hoja';
import { CampoSitio } from '@/components/mapa/CampoSitio';
import { BotonPrincipal, EnlaceTexto } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { fonts, radius } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { ErrorGasto } from '@/lib/gastos/error';
import { mensajeErrorPlan } from '@/lib/planificador/error';
import { crearIdea, editarIdea } from '@/lib/planificador/consultasIdeas';
import {
  type Idea,
  MAX_NOTAS_IDEA,
  MAX_TITULO_IDEA,
  conTipoIdea,
  filaDeIdea,
  formularioDeIdea,
  formularioIdeaNuevo,
  hayErroresIdea,
  validarIdea,
} from '@/lib/planificador/ideas';
import { EMOJIS_PLAN, TIPOS_PLAN } from '@/lib/planificador/plan';
import { useInvalidarPlanificador } from '@/lib/planificador/usePlanificador';

/**
 * Crear o editar una idea en hoja inferior: título, tipo, icono, nota y sitio opcional. Se monta al abrirla, así parte siempre
 * de lo guardado. Con `idea` edita (y ofrece «Borrar idea»).
 */
export function HojaIdea({
  coupleId,
  nombrePareja,
  idea,
  onBorrar,
  onCerrar,
}: {
  coupleId: string;
  nombrePareja: string;
  idea?: Idea;
  onBorrar?: () => void;
  onCerrar: () => void;
}) {
  const colors = useColores();
  const styles = useStyles();
  const invalidar = useInvalidarPlanificador();
  const [f, setF] = useState(() => (idea ? formularioDeIdea(idea) : formularioIdeaNuevo()));
  const [intentado, setIntentado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Id fijado al abrir: reintentar tras un fallo de red no duplica la idea.
  const [id] = useState(() => idea?.id ?? Crypto.randomUUID());
  const errores = validarIdea(f);

  const guardar = async () => {
    setIntentado(true);
    if (hayErroresIdea(errores)) return;
    setOcupado(true);
    setError(null);
    try {
      if (idea) await editarIdea(idea.id, idea.version, filaDeIdea(f), nombrePareja);
      else await crearIdea(id, coupleId, filaDeIdea(f));
      await invalidar();
      onCerrar();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : mensajeErrorPlan(e));
      if (e instanceof ErrorGasto && e.codigo === 'version') await invalidar();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Hoja
      visible
      titulo={idea ? 'Editar idea' : 'Nueva idea'}
      onCerrar={onCerrar}
      bloqueada={ocupado}
      desplazable
      pie={
        <>
          <MensajeError texto={error ?? (intentado && hayErroresIdea(errores) ? 'Revisa los campos marcados en rojo.' : null)} />
          <BotonPrincipal etiqueta={idea ? 'Guardar cambios' : 'Añadir idea'} cargando={ocupado} onPress={guardar} />
        </>
      }
    >
      <Grupo etiqueta="Título">
        <TextInput
          accessibilityLabel="Título de la idea"
          value={f.titulo}
          onChangeText={(titulo) => setF((x) => ({ ...x, titulo }))}
          maxLength={MAX_TITULO_IDEA}
          placeholder="Ver auroras boreales, un fin de semana en Roma…"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="sentences"
          returnKeyType="done"
          style={styles.campo}
        />
        <MensajeError texto={intentado ? errores.titulo : null} />
      </Grupo>
      <Grupo etiqueta="Tipo" rol="radiogroup">
        <FilaChips>
          {TIPOS_PLAN.map((t) => (
            <Chip key={t.valor} rol="radio" etiqueta={t.etiqueta} activo={f.tipo === t.valor} onPress={() => setF((x) => conTipoIdea(x, t.valor))} />
          ))}
        </FilaChips>
      </Grupo>
      <SelectorIcono etiqueta="Icono" valor={f.icono} sugeridos={EMOJIS_PLAN} onCambiar={(icono) => setF((x) => ({ ...x, icono }))} error={intentado ? errores.icono : null} />
      <CampoSitio valor={f.sitio} onCambiar={(sitio) => setF((x) => ({ ...x, sitio }))} compartido />
      <Grupo etiqueta="Nota (opcional)">
        <TextInput
          accessibilityLabel="Nota de la idea"
          value={f.nota}
          onChangeText={(nota) => setF((x) => ({ ...x, nota }))}
          maxLength={MAX_NOTAS_IDEA}
          placeholder="Lo que no queréis olvidar"
          placeholderTextColor={colors.textSecondary}
          multiline
          autoCapitalize="sentences"
          style={[styles.campo, styles.nota]}
        />
        <MensajeError texto={intentado ? errores.nota : null} />
      </Grupo>
      {idea && onBorrar ? <EnlaceTexto etiqueta="Borrar idea" deshabilitado={ocupado} onPress={onBorrar} /> : null}
    </Hoja>
  );
}

const useStyles = crearEstilos((colors) => ({
  campo: { height: 50, paddingHorizontal: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.card, fontFamily: fonts.body, fontSize: 16, color: colors.text },
  nota: { height: undefined, minHeight: 84, maxHeight: 220, paddingTop: 14, paddingBottom: 14, textAlignVertical: 'top' },
}));
