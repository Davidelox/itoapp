/** Tokens de diseño de ito (docs/especificacion-correcciones.md, sección 3). */

/** Colores de persona de la paleta clara: pastel de relleno (`bg`) y tono oscuro (`ink`). */
export const personColors = {
  menta: { bg: '#C5E7D3', ink: '#23604A', nombre: 'Menta' }, // David por defecto
  lavanda: { bg: '#D7CDF2', ink: '#4F3D8C', nombre: 'Lavanda' }, // María por defecto
  melocoton: { bg: '#F8CBB4', ink: '#8A4325', nombre: 'Melocotón' },
  aguamarina: { bg: '#BFE3E3', ink: '#1F5E60', nombre: 'Aguamarina' },
  pistacho: { bg: '#DCE8B5', ink: '#4A5E14', nombre: 'Pistacho' },
  malva: { bg: '#EBCBEA', ink: '#74306F', nombre: 'Malva' },
} as const;

/** Colores pastel de persona en oscuro: el pastel pasa a ser la tinta y el relleno un tinte oscuro. */
const personasOscuro = {
  menta: { bg: '#1F3D31', ink: '#C5E7D3', nombre: 'Menta' },
  lavanda: { bg: '#2F2850', ink: '#D7CDF2', nombre: 'Lavanda' },
  melocoton: { bg: '#4A2A1C', ink: '#F8CBB4', nombre: 'Melocotón' },
  aguamarina: { bg: '#1C3D3E', ink: '#BFE3E3', nombre: 'Aguamarina' },
  pistacho: { bg: '#333D16', ink: '#DCE8B5', nombre: 'Pistacho' },
  malva: { bg: '#432442', ink: '#EBCBEA', nombre: 'Malva' },
} as const;

/** Paleta clara (el aspecto de siempre) y oscura (docs/plan-modo-oscuro.md). Mismas claves en las dos. */
const claro = {
  // Marca y estados
  accent: '#7B2433',
  accentDark: '#5E1A26',
  accentSoft: '#F1E1E3',
  /** Tinta de lo que va encima de `accent` (texto e iconos de botones). */
  onAccent: '#FFFFFF',
  /** Tinta de lo que va encima de `pagoMarca` y `cumpleMarca`. */
  onMarca: '#FFFFFF',
  /** Texto de error. */
  error: '#7B2433',

  background: '#FBF7E9',
  /** Fondo de tarjetas, hojas, barra de pestañas y campos elevados (antes `white`). */
  card: '#FFFFFF',
  surface: '#EFEBE3',

  text: '#2A2627',
  textSecondary: '#625C5A',
  icon: '#4F4946',

  /** Tinte cálido de los fines de semana en la rejilla del Mes (docs/plan-cabeceras-calendario.md §5). */
  finde: '#FAF6EE',
  /** Fondo gris cálido de los días de otros meses en la rejilla del Mes (por encima del tinte de fin de semana). */
  fueraDeMes: '#F2F0EC',
  /** Número de los días de otros meses: más suave que el secundario, ≥ 4,5:1 sobre `card`, `finde` y `fueraDeMes`. */
  diaAtenuado: '#6B6460',

  border: '#E6E1D6',
  divider: '#EEEAE1',
  inputBorder: '#DED8CC',
  segmented: '#ECE7DD',
  /** Casilla y botón de opción sin marcar. */
  casilla: '#B9B2A4',
  switchOff: '#CFC8BB',
  /** Pomo del interruptor. */
  thumb: '#FFFFFF',
  /** Tinte granate suave que se superpone mientras se mantiene pulsada una celda o una fila (se ve también sobre accentSoft). */
  pressed: 'rgba(123, 36, 51, 0.14)',
  /** Fondo de hojas inferiores y de menús flotantes. */
  velo: 'rgba(42, 38, 39, 0.45)',
  veloSuave: 'rgba(42, 38, 39, 0.08)',
  sombra: '#7A3419',
  /** Fondo de la atribución sobre el mapa. */
  atribucion: 'rgba(255, 255, 255, 0.85)',

  /** Título de cabecera (Damion): relleno y halo. */
  tituloRelleno: '#5E1A26',
  tituloContorno: '#7B2433',
  /** Hilo sobre `accent` (botones): cuerpo y sombra. La del hilo sobre el fondo es `accent` + `hiloSombra`. */
  hiloSobreAcento: '#FBF7E9',
  hiloSobreAcentoSombra: '#2B080E',
  hiloSombra: '#5E1A26',

  // Eventos
  eventDot: '#3F7099',
  eventChip: '#DCEAF4',
  eventChipText: '#2C4A5E',

  // Pagos
  paymentDot: '#B8901A',
  paymentChip: '#F8EDC4',
  paymentChipText: '#5C4A12',

  // Calendario (docs/plan-calendario-v2.md §2.3): el pago es naranja y cuadrado, el cumpleaños fucsia con anillo.
  pagoMarca: '#D2691E',
  pagoChip: '#FBE3D0',
  pagoChipTexto: '#7A3A0E',
  cumpleMarca: '#C2185B',
  cumpleChip: '#FADCE9',
  cumpleChipTexto: '#8E1446',

  personas: personColors as Record<keyof typeof personColors, { bg: string; ink: string; nombre: string }>,
};

export type Paleta = typeof claro;

/** Acento pastel: el crema del fondo claro (`#FBF7E9`); el texto es un crema más neutro para que no se confundan. */
const oscuro: Paleta = {
  accent: '#FBF7E9',
  accentDark: '#FFFDF4',
  accentSoft: '#4A2830',
  onAccent: '#3A0F18',
  onMarca: '#1C1012',
  error: '#FF8A80',

  background: '#1C1012',
  card: '#261518',
  surface: '#331F24',

  text: '#DCD3CB',
  textSecondary: '#B3A49B',
  icon: '#C4B6AD',

  finde: '#211316',
  fueraDeMes: '#170D0F',
  diaAtenuado: '#A8968E',

  border: '#3F2A2F',
  divider: '#332125',
  inputBorder: '#8C6D73',
  segmented: '#3A242A',
  casilla: '#8A7076',
  switchOff: '#5A4449',
  thumb: '#FFFFFF',
  pressed: 'rgba(251, 247, 233, 0.12)',
  velo: 'rgba(0, 0, 0, 0.6)',
  veloSuave: 'rgba(0, 0, 0, 0.3)',
  sombra: '#000000',
  atribucion: 'rgba(38, 21, 24, 0.85)',

  tituloRelleno: '#FBF7E9',
  tituloContorno: '#7B2433',
  hiloSobreAcento: '#3A0F18',
  hiloSobreAcentoSombra: '#FFFDF4',
  hiloSombra: '#000000',

  eventDot: '#86B4DC',
  eventChip: '#1F3446',
  eventChipText: '#BFD9EE',

  paymentDot: '#E2BE52',
  paymentChip: '#3D3214',
  paymentChipText: '#F0DC9A',

  pagoMarca: '#F0954E',
  pagoChip: '#46281A',
  pagoChipTexto: '#F6C6A0',
  cumpleMarca: '#F27AAE',
  cumpleChip: '#4A1A2E',
  cumpleChipTexto: '#F7B3D0',

  personas: personasOscuro,
};

export const paletas = { claro, oscuro } as const;

/** Mismo enum que `person_color` en la base de datos. */
export type ColorPersona = keyof typeof personColors;
/** Orden de la paleta: el primer color libre se preselecciona. */
export const COLORES_PERSONA = Object.keys(personColors) as ColorPersona[];

export const radius = {
  sm: 8,
  md: 13,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Nombres de familia tal como los registra useFonts en app/_layout.tsx. */
export const fonts = {
  title: 'Fraunces_600SemiBold',
  titleBold: 'Fraunces_700Bold',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodyBold: 'DMSans_700Bold',
  /** Damion: logotipo de ito y títulos de cabecera de las pestañas. */
  brand: 'Damion_400Regular',
} as const;

export const fontSizes = {
  caption: 12,
  small: 14,
  body: 16,
  heading: 17,
  title: 32,
} as const;


