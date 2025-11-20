/* Type declarations for theme.js */
export const themeTokens: {
  colors: any;
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  shadows: Record<string, string>;
  typography: any;
};

export const antdThemeConfig: any;
export const darkThemeConfig: any;

export type ThemeTokens = typeof themeTokens;