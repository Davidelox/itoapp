import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Hoja } from '@/components/gastos/Hoja';
import { AvatarPersona } from '@/components/onboarding/AvatarPersona';
import { BotonPrincipal, EnlaceTexto } from '@/components/onboarding/Botones';
import { CampoTexto } from '@/components/onboarding/CampoTexto';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { SelectorColor } from '@/components/onboarding/SelectorColor';
import { COLORES_PERSONA, type ColorPersona, colors, fonts, personColors } from '@/constants/theme';
import { borrarCuenta } from '@/lib/ajustes/consultas';
import { cambiarContrasena, cerrarSesion, contrasenaValida, pedirCodigoReautenticacion } from '@/lib/auth/acciones';
import { MENSAJES } from '@/lib/auth/errores';
import { ErrorGasto } from '@/lib/gastos/error';
import { useInvalidarGastos } from '@/lib/gastos/useGastos';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { guardarPerfil, salirDelEspacio } from '@/lib/pareja/acciones';
import { registrarError } from '@/lib/registro';

/** Foto, nombre y color. Es solo tuyo: se guarda al momento, sin aprobación. */
export function HojaPerfil({ onCerrar }: { onCerrar: () => void }) {
  const { pareja, userId, refrescar } = useEstado();
  const invalidar = useInvalidarGastos();
  const yo = pareja?.yo;
  const otra = pareja?.otra ?? null;
  const [nombre, setNombre] = useState(yo?.nombre ?? '');
  const [elegido, setElegido] = useState<ColorPersona | null>(yo?.color ?? null);
  const [foto, setFoto] = useState<string | null>(null);
  const [quitar, setQuitar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!pareja || !yo || !userId) return null;

  const ocupados: Partial<Record<ColorPersona, string>> = otra?.color ? { [otra.color]: otra.nombre.trim() || 'tu pareja' } : {};
  const color = elegido && !ocupados[elegido] ? elegido : (COLORES_PERSONA.find((c) => !ocupados[c]) ?? null);
  const tieneFoto = !!foto || (!!yo.avatarPath && !quitar);
  const cambiado = nombre.trim() !== yo.nombre.trim() || color !== yo.color || !!foto || quitar;

  const elegirFoto = async () => {
    setError(null);
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
      if (!r.canceled && r.assets[0]) {
        setFoto(r.assets[0].uri);
        setQuitar(false);
      }
    } catch (e) {
      registrarError('ajustes.elegirFoto', e);
      setError('No se ha podido abrir tus fotos.');
    }
  };

  const guardar = async () => {
    if (!color) return;
    setOcupado(true);
    setError(null);
    const r = await guardarPerfil({
      userId,
      nombre,
      color,
      foto: foto ? { uri: foto } : null,
      avatarAnterior: yo.avatarPath,
      quitarFoto: quitar,
    });
    setOcupado(false);
    if (!r.ok) {
      setError(r.mensaje);
      if (r.codigo === 'color_ocupado') {
        setElegido(null);
        await refrescar();
      }
      return;
    }
    await refrescar();
    invalidar();
    onCerrar();
  };

  return (
    <Hoja
      visible
      titulo="Tu perfil"
      onCerrar={onCerrar}
      bloqueada={ocupado}
      desplazable
      pie={
        <>
          <MensajeError texto={error} />
          <BotonPrincipal
            etiqueta="Guardar"
            etiquetaCargando="Guardando…"
            cargando={ocupado}
            deshabilitado={!cambiado || nombre.trim() === '' || !color}
            onPress={guardar}
          />
        </>
      }
    >
      <View style={styles.avatarFila}>
        <Pressable accessibilityRole="button" accessibilityLabel={tieneFoto ? 'Cambiar foto' : 'Añadir foto'} onPress={elegirFoto}>
          <AvatarPersona nombre={nombre} color={color} uriLocal={foto} avatarPath={quitar ? null : yo.avatarPath} tamano={96} />
        </Pressable>
        <View style={styles.enlaces}>
          <EnlaceTexto etiqueta={tieneFoto ? 'Cambiar foto' : 'Añadir foto'} onPress={elegirFoto} />
          {tieneFoto ? (
            <EnlaceTexto
              etiqueta="Quitar foto"
              onPress={() => {
                setFoto(null);
                setQuitar(!!yo.avatarPath);
              }}
            />
          ) : null}
        </View>
      </View>
      <CampoTexto
        etiqueta="Tu nombre"
        value={nombre}
        onChangeText={setNombre}
        maxLength={40}
        autoCapitalize="words"
        autoComplete="given-name"
        textContentType="givenName"
      />
      <View style={styles.colorTitulo}>
        <Text style={styles.etiqueta}>Tu color</Text>
        {color ? <Text style={[styles.nombreColor, { color: personColors[color].ink }]}>{personColors[color].nombre}</Text> : null}
      </View>
      <SelectorColor valor={color} onCambiar={setElegido} ocupados={ocupados} inicial={nombre.trim().charAt(0).toUpperCase() || '?'} />
      {otra?.color ? <Text style={styles.ayuda}>El color de {otra.nombre.trim() || 'tu pareja'} no se puede repetir.</Text> : null}
    </Hoja>
  );
}

/**
 * Cambiar la contraseña desde la app. Si Supabase pide confirmar (sesión de más de 24 h con «Secure password
 * change»), se envía un código al email y se pide aquí mismo.
 */
export function HojaContrasena({ onCerrar }: { onCerrar: () => void }) {
  const [password, setPassword] = useState('');
  const [codigo, setCodigo] = useState('');
  const [pideCodigo, setPideCodigo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  const enviar = async () => {
    if (!contrasenaValida(password)) {
      setError(MENSAJES.contrasenaDebil);
      return;
    }
    setOcupado(true);
    setError(null);
    const r = await cambiarContrasena(password, pideCodigo ? codigo.trim() : undefined);
    if (!r.ok && r.codigo === 'reautenticar' && !pideCodigo) {
      const envio = await pedirCodigoReautenticacion();
      setOcupado(false);
      if (!envio.ok) {
        setError(envio.mensaje);
        return;
      }
      setPideCodigo(true);
      setError(null);
      return;
    }
    setOcupado(false);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    setPassword('');
    setHecho(true);
  };

  if (hecho) {
    return (
      <Hoja visible titulo="Contraseña cambiada" onCerrar={onCerrar}>
        <Text style={styles.texto}>¡Has cambiado tu contraseña con éxito! La próxima vez entra con la nueva.</Text>
        <BotonPrincipal etiqueta="Cerrar" onPress={onCerrar} />
      </Hoja>
    );
  }
  return (
    <Hoja visible titulo="Cambiar contraseña" onCerrar={onCerrar} bloqueada={ocupado}>
      <CampoTexto
        etiqueta="Contraseña nueva"
        value={password}
        onChangeText={setPassword}
        ayuda="Al menos 10 caracteres, con letras y números."
        contrasena
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
      />
      {pideCodigo ? (
        <CampoTexto
          etiqueta="Código del email"
          ayuda="Por seguridad, te hemos enviado un código a tu email."
          value={codigo}
          onChangeText={(t) => setCodigo(t.replace(/\D/g, ''))}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={10}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
        />
      ) : null}
      <MensajeError texto={error} />
      <BotonPrincipal
        etiqueta="Guardar contraseña"
        etiquetaCargando="Guardando…"
        cargando={ocupado}
        deshabilitado={password === '' || (pideCodigo && codigo.trim().length < 6)}
        onPress={enviar}
      />
    </Hoja>
  );
}

/** Salir del espacio (o eliminarlo si no hay nadie más). Antes estaba en Inicio. */
export function HojaSalir({ onCerrar }: { onCerrar: () => void }) {
  const { pareja, refrescar } = useEstado();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!pareja) return null;
  const otra = pareja.otra ? pareja.otra.nombre.trim() || 'Tu pareja' : null;

  const salir = async () => {
    setError(null);
    setOcupado(true);
    const r = await salirDelEspacio();
    if (!r.ok) {
      setOcupado(false);
      setError(r.mensaje);
      return;
    }
    // La fase pasa a «sin pareja» y la guarda lleva a «Vuestro espacio».
    await refrescar();
  };

  return (
    <Hoja visible titulo={otra ? '¿Salir del espacio?' : '¿Eliminar el espacio?'} onCerrar={onCerrar} bloqueada={ocupado}>
      <Text style={styles.texto}>
        {otra
          ? `${otra} seguirá dentro con los gastos compartidos. Se borrará lo que sea solo tuyo y privado. Para volver, ${otra} tendrá que darte un código nuevo.`
          : 'Se borrará vuestro espacio con todo lo que tenga. Después podrás crear otro o unirte con un código.'}
      </Text>
      <MensajeError texto={error} />
      <BotonPrincipal etiqueta={otra ? 'Sí, salir' : 'Sí, eliminar'} etiquetaCargando="Un momento…" cargando={ocupado} onPress={salir} />
      <EnlaceTexto etiqueta="Cancelar" deshabilitado={ocupado} onPress={onCerrar} />
    </Hoja>
  );
}

/** Borrar la cuenta (Apple lo exige). Lo hace la Edge Function `borrar-cuenta`. */
export function HojaBorrarCuenta({ onCerrar }: { onCerrar: () => void }) {
  const { pareja } = useEstado();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const otra = pareja?.otra ? pareja.otra.nombre.trim() || 'Tu pareja' : null;

  const borrar = async () => {
    setError(null);
    setOcupado(true);
    try {
      await borrarCuenta();
      // La sesión ya no vale: se cierra en este dispositivo y la app vuelve a Bienvenida.
      await cerrarSesion();
    } catch (e) {
      setOcupado(false);
      setError(e instanceof ErrorGasto ? e.message : 'No se ha podido borrar la cuenta. Inténtalo en unos minutos.');
    }
  };

  return (
    <Hoja visible titulo="¿Borrar tu cuenta?" onCerrar={onCerrar} bloqueada={ocupado}>
      <Text style={styles.texto}>
        Se borrarán tu cuenta, tu perfil y todo lo que sea solo tuyo y privado. No se puede deshacer.
        {otra
          ? ` Los gastos compartidos se quedan para ${otra}, que seguirá en el espacio.`
          : ' Como no hay nadie más en vuestro espacio, también se borrará entero.'}
      </Text>
      <MensajeError texto={error} />
      <BotonPrincipal etiqueta="Borrar mi cuenta" etiquetaCargando="Borrando…" cargando={ocupado} onPress={borrar} />
      <EnlaceTexto etiqueta="Cancelar" deshabilitado={ocupado} onPress={onCerrar} />
    </Hoja>
  );
}

const styles = StyleSheet.create({
  avatarFila: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  enlaces: { alignItems: 'flex-start' },
  colorTitulo: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  etiqueta: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  nombreColor: { fontFamily: fonts.bodyBold, fontSize: 14 },
  ayuda: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  texto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text },
});
