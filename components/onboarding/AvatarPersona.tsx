import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { type ColorPersona, fonts } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { useUrlAvatar } from '@/lib/avatar';
import { paletaDe } from '@/lib/calendario/colores';

type Props = {
  nombre: string;
  color: ColorPersona | null;
  /** Ruta en el bucket privado `avatars`. */
  avatarPath?: string | null;
  /** Foto local aún sin subir (vista previa en Tu perfil). */
  uriLocal?: string | null;
  tamano?: number;
  cargando?: boolean;
  /** Texto de la inicial cuando aún no hay nombre. */
  vacio?: string;
  /** Anillo fino con el color de perfil (`ink`; el azul de reserva si no hay color) alrededor de la foto o la inicial. */
  anillo?: boolean;
};

/** Foto, o la inicial en la tinta del color sobre su fondo pastel. Se reutilizará en toda la app. */
export function AvatarPersona({ nombre, color, avatarPath, uriLocal, tamano = 44, cargando = false, vacio = '?', anillo = false }: Props) {
  const colors = useColores();
  const styles = useStyles();
  const firmada = useUrlAvatar(avatarPath);
  const paleta = color ? colors.personas[color] : { bg: colors.surface, ink: colors.icon };
  const inicial = nombre.trim().charAt(0).toUpperCase() || vacio;
  const uri = uriLocal ?? firmada;
  const aro = anillo ? ANILLO : 0;
  const circulo = (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={nombre.trim() ? `Avatar de ${nombre.trim()}` : 'Avatar'}
      style={[styles.circulo, { width: tamano, height: tamano, borderRadius: tamano / 2, backgroundColor: paleta.bg }]}
    >
      {uri ? (
        <Image
          source={{ uri, cacheKey: avatarPath ?? undefined }}
          style={{ width: tamano, height: tamano }}
          contentFit="cover"
          accessible={false}
        />
      ) : (
        <Text style={[styles.inicial, { fontSize: tamano * 0.42, color: paleta.ink }]}>{inicial}</Text>
      )}
      {cargando && (
        <View style={styles.velo}>
          <CargandoHilo color={colors.thumb} />
        </View>
      )}
    </View>
  );
  if (!anillo) return circulo;
  // El anillo va fuera: el círculo mantiene `tamano` y el aro lo rodea con el color de la persona.
  return (
    <View
      style={{
        width: tamano + aro * 2,
        height: tamano + aro * 2,
        borderRadius: (tamano + aro * 2) / 2,
        borderWidth: aro,
        borderColor: paletaDe(color, colors).borde,
      }}
    >
      {circulo}
    </View>
  );
}

const ANILLO = 3;

const useStyles = crearEstilos((colors) => ({
  circulo: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  inicial: { fontFamily: fonts.titleBold },
  velo: { ...StyleSheet.absoluteFill, backgroundColor: colors.velo, alignItems: 'center', justifyContent: 'center' },
}));
