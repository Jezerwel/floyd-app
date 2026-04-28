export const breakpoints = {
  sm: 375,
  md: 768,
  lg: 1024,
  xl: 1440,
} as const;

export type Breakpoint = keyof typeof breakpoints;
