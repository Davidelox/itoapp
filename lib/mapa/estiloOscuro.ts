import type { MapStyleElement } from 'react-native-maps';

/** Estilo oscuro del mapa en Android (Google Maps); en iOS basta `userInterfaceStyle`. Tonos de la paleta oscura de ito. */
export const ESTILO_MAPA_OSCURO: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#261518' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#B3A49B' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1C1012' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#3F2A2F' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#22251A' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#3A242A' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#2A1A1E' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#4A2E35' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#14222B' }] },
];
