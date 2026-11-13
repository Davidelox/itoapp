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

  border: '#E6E1D6',
  divider: '#EEEAE1',
  inputBorder: '#DED8CC',
  segmented: '#ECE7DD',

  // Eventos
  eventDot: '#3F7099',
  eventChip: '#DCEAF4',
  eventChipText: '#2C4A5E',

  // Pagos
  paymentDot: '#B8901A',
  paymentChip: '#F8EDC4',
  paymentChipText: '#5C4A12',
} as const;

/** Colores pastel de persona: solo para avatares, chips y nombres; nunca para estados, botones ni textos de la app. */
export const personColors = {
  mint: { bg: '#C5E7D3', ink: '#23604A' }, // David por defecto
  lavender: { bg: '#D7CDF2', ink: '#4F3D8C' }, // María por defecto
  peach: { bg: '#F8CBB4', ink: '#8A4325' },
  aqua: { bg: '#BFE3E3', ink: '#1F5E60' },
  pistachio: { bg: '#DCE8B5', ink: '#4A5E14' },
  mauve: { bg: '#EBCBEA', ink: '#74306F' },
} as const;

export type PersonColorKey = keyof typeof personColors;

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
  /** Damion: solo para el logotipo de ito; no usar en textos de la app. */
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
