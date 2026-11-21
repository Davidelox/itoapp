/** Tokens de diseño de ito (docs/especificacion-correcciones.md, sección 3). */

export const colors = {
  // Marca y estados
  accent: '#7B2433',
  accentDark: '#5E1A26',
  accentSoft: '#F1E1E3',

  background: '#FBF7E9',
  surface: '#EFEBE3',
  white: '#FFFFFF',

  text: '#2A2627',
  textSecondary: '#625C5A',
  icon: '#4F4946',

  /** Tinte cálido de los fines de semana en la rejilla del Mes (docs/plan-cabeceras-calendario.md §5). */
  finde: '#FAF6EE',
  /** Fondo gris cálido de los días de otros meses en la rejilla del Mes (por encima del tinte de fin de semana). */
  fueraDeMes: '#F2F0EC',
  /** Número de los días de otros meses: más suave que el secundario, ≥ 4,5:1 sobre blanco, `finde` y `fueraDeMes`. */
  diaAtenuado: '#6B6460',

  border: '#E6E1D6',
  divider: '#EEEAE1',
  inputBorder: '#DED8CC',
  segmented: '#ECE7DD',
  /** Tinte granate suave que se superpone mientras se mantiene pulsada una celda o una fila (se ve también sobre accentSoft). */
  pressed: 'rgba(123, 36, 51, 0.14)',

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
} as const;

/** Colores pastel de persona: solo para avatares, chips y nombres; nunca para estados, botones ni textos de la app. */
export const personColors = {
  menta: { bg: '#C5E7D3', ink: '#23604A', nombre: 'Menta' }, // David por defecto
  lavanda: { bg: '#D7CDF2', ink: '#4F3D8C', nombre: 'Lavanda' }, // María por defecto
  melocoton: { bg: '#F8CBB4', ink: '#8A4325', nombre: 'Melocotón' },
  aguamarina: { bg: '#BFE3E3', ink: '#1F5E60', nombre: 'Aguamarina' },
  pistacho: { bg: '#DCE8B5', ink: '#4A5E14', nombre: 'Pistacho' },
  malva: { bg: '#EBCBEA', ink: '#74306F', nombre: 'Malva' },
} as const;

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

export const theme = { colors, personColors, radius, spacing, fonts, fontSizes };
