import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import { clsx } from 'clsx';

interface Step {
  name: string;
  description?: string;
}

interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
  steps: Step[];
}

export function ProgressIndicator({ currentStep, totalSteps, steps }: ProgressIndicatorProps) {
  const progress = (currentStep / (totalSteps - 1)) * 100;

  return (
    <div className="relative">
      {/* 背景连线 */}
      <div className="absolute top-3 left-0 right-0 h-0.5 bg-gray-200" />

      {/* 进度连线 - 渐变动画 */}
      <motion.div
        className="absolute top-3 left-0 h-0.5 bg-gradient-to-r from-purple-500 to-blue-500"
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />

      {/* 步骤点 */}
      <div className="relative flex justify-between">
        {steps.map((step, index) => (
          <div key={index} className="flex flex-col items-center gap-1.5">
            {/* 圆点 */}
            <motion.div
              className={clsx(
                "w-6 h-6 rounded-full flex items-center justify-center z-10",
                "transition-all duration-300",
                index < currentStep && "bg-gradient-to-br from-green-400 to-green-600 shadow-md",
                index === currentStep && "bg-gradient-to-br from-purple-500 to-blue-500 shadow-md shadow-purple-500/40 animate-pulse",
                index > currentStep && "bg-gray-200"
              )}
              whileHover={{ scale: 1.1 }}
              transition={{ duration: 0.2 }}
            >
              {index < currentStep ? (
                <CheckCircle className="w-3.5 h-3.5 text-white" />
              ) : (
                <span className={clsx(
                  "text-xs font-semibold",
                  index === currentStep ? "text-white" : "text-gray-500"
                )}>
                  {index + 1}
                </span>
              )}
            </motion.div>

            {/* 步骤名称 */}
            <span className={clsx(
              "text-xs font-medium transition-colors text-center",
              index <= currentStep ? "text-gray-900" : "text-gray-600"
            )}>
              {step.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
