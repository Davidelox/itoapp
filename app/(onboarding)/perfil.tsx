import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BotonNudo } from '@/components/hilo/BotonNudo';
import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { EnlaceTexto } from '@/components/onboarding/Botones';
import { CampoTexto } from '@/components/onboarding/CampoTexto';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { Pantalla } from '@/components/onboarding/Pantalla';
import { SelectorColor } from '@/components/onboarding/SelectorColor';
import { COLORES_PERSONA, type ColorPersona, colors, fonts, personColors, radius } from '@/constants/theme';
import { registrarError } from '@/lib/registro';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { guardarPerfil } from '@/lib/pareja/acciones';

const PAUSA_NUDO_MS = 1500;

export default function Perfil() {
  const { pareja, userId, refrescar, retenerFase, soltarFase } = useEstado();
  const yo = pareja?.yo;
  const otra = pareja?.otra ?? null;
  const [nombre, setNombre] = useState(yo?.nombre ?? '');
  const [elegido, setElegido] = useState<ColorPersona | null>(yo?.color ?? null);
  const [foto, setFoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);

  // El color de la otra persona queda desactivado. Si coincide con el elegido (lo acaba de coger), se cambia.
  const ocupados: Partial<Record<ColorPersona, string>> = otra?.color ? { [otra.color]: otra.nombre.trim() || 'tu pareja' } : {};
  const primerLibre = COLORES_PERSONA.find((c) => !ocupados[c]) ?? null;
  const color = elegido && !ocupados[elegido] ? elegido : primerLibre;
  const quienEs = otra?.nombre.trim() || 'Tu pareja';

  const elegirFoto = async () => {
    setErrorFoto(null);
    try {
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (!r.canceled && r.assets[0]) setFoto(r.assets[0].uri);
    } catch (e) {
      registrarError('perfil.elegirFoto', e);
      setErrorFoto('No se ha podido abrir tus fotos.');
    }
  };

  const continuar = async () => {
    if (!userId || !color) throw new Error('perfil_incompleto');
    setError(null);
    setErrorFoto(null);
    retenerFase();
    const r = await guardarPerfil({
      userId,
      nombre,
      color,
      foto: foto ? { uri: foto } : null,
      avatarAnterior: yo?.avatarPath ?? null,
    });
    if (!r.ok) {
      soltarFase();
      if (r.codigo === 'foto_fallo') setErrorFoto(r.mensaje);
      else setError(r.mensaje);
      if (r.codigo === 'color_ocupado') {
        setElegido(null);
        await refrescar();
      }
      throw new Error(r.codigo ?? 'perfil_fallo');
    }
    await refrescar();
  };

  return (
    <Pantalla
      paso={2}
      titulo="¿Cómo te llamas?"
      pie={
        <BotonNudo
          label="Continuar"
          labelHecho="Todo listo"
          labelError="No se ha podido guardar"
          disabled={nombre.trim() === '' || !color}
          onPress={continuar}
          onHecho={() => soltarFase(PAUSA_NUDO_MS)}
        />
      }
    >
      {yo?.slot === 'm2' && otra ? (
        <View style={styles.invitacion}>
          <Text style={styles.invitacionTitulo}>{quienEs} te ha invitado</Text>
          <Text style={styles.invitacionTexto}>
            {quienEs} ha configurado: {pareja?.ajustes?.reparto ?? 'reparto a medias'} ·{' '}
            {pareja?.ajustes?.bote ? 'con bote común' : 'sin bote común'}. Podrás proponer cambios en Ajustes.
          </Text>
        </View>
      ) : null}

      <View style={styles.avatarFila}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={foto ? 'Cambiar foto' : 'Añadir foto'}
          onPress={elegirFoto}
          style={styles.avatarBoton}
        >
          <AvatarPersona nombre={nombre} color={color} uriLocal={foto} avatarPath={yo?.avatarPath} tamano={112} />
        </Pressable>
        <EnlaceTexto etiqueta={foto ? 'Cambiar foto' : 'Añadir foto'} onPress={elegirFoto} />
        {foto ? <EnlaceTexto etiqueta="Seguir sin foto" onPress={() => { setFoto(null); setErrorFoto(null); }} /> : null}
        <MensajeError texto={errorFoto} />
      </View>

      <CampoTexto
        etiqueta="Tu nombre"
        ayuda="Así te verá tu pareja en la app."
        value={nombre}
        onChangeText={setNombre}
        maxLength={40}
        autoCapitalize="words"
        autoComplete="given-name"
        textContentType="givenName"
        returnKeyType="done"
      />

      <View style={styles.colorGrupo}>
        <View style={styles.colorTitulo}>
          <Text style={styles.etiqueta}>Tu color</Text>
          {color ? <Text style={[styles.nombreColor, { color: personColors[color].ink }]}>{personColors[color].nombre}</Text> : null}
        </View>
        <SelectorColor valor={color} onCambiar={setElegido} ocupados={ocupados} inicial={nombre.trim().charAt(0).toUpperCase() || '?'} />
        <Text style={styles.ayuda}>Tu pareja no podrá elegir el mismo color.</Text>
        <MensajeError texto={error} />
      </View>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  invitacion: { gap: 6, padding: 16, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  invitacionTitulo: { fontFamily: fonts.title, fontSize: 19, color: colors.text },
  invitacionTexto: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  avatarFila: { alignItems: 'center', gap: 4 },
  avatarBoton: { borderRadius: 56 },
  colorGrupo: { gap: 12 },
  colorTitulo: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  etiqueta: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  nombreColor: { fontFamily: fonts.bodyBold, fontSize: 14 },
  ayuda: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
});
