import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

function lanzar(fn: () => Promise<void>) {
  if (Platform.OS === 'web') return;
  fn().catch(() => {});
}

export const hapticaLigera = () => lanzar(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
export const hapticaExito = () => lanzar(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
