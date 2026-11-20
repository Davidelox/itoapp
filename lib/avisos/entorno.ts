import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { puedeRecibirPushDe } from '@/lib/avisos/estado';

export const enExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const puedeRecibirPush = () =>
  puedeRecibirPushDe({ web: Platform.OS === 'web', expoGo: enExpoGo, dispositivoReal: Device.isDevice });
