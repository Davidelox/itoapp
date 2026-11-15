import { Image } from 'expo-image';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { type ColorPersona, colors, fonts, personColors } from '@/constants/theme';
import { useUrlAvatar } from '@/lib/avatar';

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
};

/** Foto, o la inicial en la tinta del color sobre su fondo pastel. Se reutilizará en toda la app. */
export function AvatarPersona({ nombre, color, avatarPath, uriLocal, tamano = 44, cargando = false, vacio = '?' }: Props) {
  const firmada = useUrlAvatar(avatarPath);
  const paleta = color ? personColors[color] : { bg: colors.surface, ink: colors.icon };
  const inicial = nombre.trim().charAt(0).toUpperCase() || vacio;
  const uri = uriLocal ?? firmada;
  return (
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
          <ActivityIndicator color={colors.white} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circulo: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  inicial: { fontFamily: fonts.titleBold },
  velo: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(42,38,39,0.35)', alignItems: 'center', justifyContent: 'center' },
});
