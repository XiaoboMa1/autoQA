import React from 'react';
import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  className?: string;
}

export function LoadingSpinner({ 
  size = 'md', 
  color = '#3b82f6', 
  className = '' 
}: LoadingSpinnerProps) {
  const sizeMap = {
    sm: 20,
    md: 32,
    lg: 48,
  };
  
  const spinnerSize = sizeMap[size];
  
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <motion.div
        className="relative"
        style={{ width: spinnerSize, height: spinnerSize }}
      >
        {/* Outer ring */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-gray-200 dark:border-gray-700"
          style={{ borderTopColor: color }}
          animate={{ rotate: 360 }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: "linear"
          }}
        />
        
        {/* Inner pulsing dot */}
        <motion.div
          className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full transform -translate-x-1/2 -translate-y-1/2"
          style={{ backgroundColor: color }}
          animate={{
            scale: [1, 1.5, 1],
            opacity: [1, 0.5, 1]
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </motion.div>
    </div>
  );
}

// Page loading component
export function PageLoading() {
  return (
    <motion.div
      className="fixed inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="flex flex-col items-center gap-4"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <LoadingSpinner size="lg" />
        <motion.p
          className="text-gray-600 dark:text-gray-600 font-medium"
          animate={{
            opacity: [0.5, 1, 0.5]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          加载中...
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

// Skeleton loading component
export function SkeletonLoader({ 
  width = '100%', 
  height = '20px', 
  className = '' 
}: {
  width?: string;
  height?: string;
  className?: string;
}) {
  return (
    <motion.div
      className={`bg-gray-200 dark:bg-gray-700 rounded-lg ${className}`}
      style={{ width, height }}
      animate={{
        backgroundColor: [
          'rgba(229, 231, 235, 1)', // gray-200
          'rgba(243, 244, 246, 1)', // gray-100
          'rgba(229, 231, 235, 1)', // gray-200
        ]
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    />
  );
}