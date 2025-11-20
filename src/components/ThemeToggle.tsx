import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { motion } from 'framer-motion';
import { useThemeContext } from '../hooks/useTheme.tsx';

interface ThemeToggleProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ThemeToggle({ size = 'md', className = '' }: ThemeToggleProps) {
  const { isDark, toggleTheme } = useThemeContext();

  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5', 
    lg: 'h-6 w-6',
  };

  return (
    <motion.button
      onClick={toggleTheme}
      className={`
        ${sizeClasses[size]} 
        rounded-lg 
        border border-gray-200 dark:border-gray-700
        bg-white dark:bg-gray-800
        text-gray-600 dark:text-gray-300
        hover:bg-gray-50 dark:hover:bg-gray-700
        hover:text-gray-900 dark:hover:text-gray-100
        transition-all duration-200
        flex items-center justify-center
        ${className}
      `}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
    >
      <motion.div
        initial={false}
        animate={{
          rotate: isDark ? 180 : 0,
          scale: isDark ? 0.8 : 1,
        }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
        {isDark ? (
          <Moon className={iconSizes[size]} />
        ) : (
          <Sun className={iconSizes[size]} />
        )}
      </motion.div>
    </motion.button>
  );
}