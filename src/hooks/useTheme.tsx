import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';

// 主题上下文类型
interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
  theme: 'dark' | 'light';
}

// 主题上下文
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);


// 主题 Hook
export function useTheme(): ThemeContextType {
  const [isDark, setIsDark] = useState(() => {
    // 从 localStorage 读取用户偏好
    const saved = localStorage.getItem('theme-mode');
    if (saved) {
      return saved === 'dark';
    }
    // 检查系统偏好
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    // 保存到 localStorage
    localStorage.setItem('theme-mode', isDark ? 'dark' : 'light');
    
    // 设置 HTML 类名用于 CSS 变量
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);

  return {
    isDark,
    toggleTheme,
    theme: isDark ? 'dark' : 'light',
  };
}

// 主题提供者组件
interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const themeValue = useTheme();
  
  return (
    <ThemeContext.Provider value={themeValue}>
      {children}
    </ThemeContext.Provider>
  );
}

// 使用主题上下文的 Hook
export function useThemeContext(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within ThemeProvider');
  }
  return context;
}