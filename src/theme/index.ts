/**
 * Lifeline Design System
 * Emergency-focused dark theme with high-contrast readability.
 */

export const Colors = {
  // Backgrounds
  background: '#0A0C10',
  surface: '#111318',
  surfaceElevated: '#1A1E26',
  surfaceBorder: '#252B36',

  // Brand / Primary
  primary: '#00C9A7',       // Teal — alive, connected
  primaryDim: '#007A66',
  primaryMuted: '#004D40',

  // Danger / SOS
  danger: '#FF3B30',        // iOS-red for maximum urgency
  dangerDim: '#CC2F27',
  dangerMuted: '#4D1210',

  // Warning
  warning: '#FF9500',
  warningMuted: '#4D2D00',

  // Info / AI
  info: '#5AC8FA',
  infoMuted: '#0A2D3D',

  // Neutral text
  textPrimary: '#F2F4F8',
  textSecondary: '#8A9BB5',
  textTertiary: '#4A576B',
  textDisabled: '#2E3847',

  // Status
  online: '#34C759',
  offline: '#FF3B30',
  idle: '#FF9500',
  unknown: '#4A576B',

  // Transparent overlays
  overlay: 'rgba(0,0,0,0.6)',
  overlayLight: 'rgba(255,255,255,0.04)',
} as const;

export const Typography = {
  fontFamily: {
    regular: undefined,   // System default (SF Pro / Roboto)
    mono: undefined,      // System mono
  },
  size: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    display: 32,
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    heavy: '800' as const,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  danger: {
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  primary: {
    shadowColor: '#00C9A7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
} as const;
