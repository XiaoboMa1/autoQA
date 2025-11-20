import React from 'react';
import { Card, Statistic } from 'antd';
import { motion } from 'framer-motion';

interface StatCardProps {
  icon: React.ReactNode;
  value: string | number;
  title: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  valueStyle?: React.CSSProperties;
  loading?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  icon,
  value,
  title,
  prefix,
  suffix,
  valueStyle,
  loading = false,
}) => {
  return (
    <motion.div
      whileHover={{ 
        y: -4,
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)'
      }}
      transition={{ duration: 0.2 }}
      className="h-full"
    >
      <Card
        loading={loading}
        className="h-full min-h-[140px] border-0 shadow-md hover:shadow-lg transition-all duration-300"
        style={{
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          borderRadius: '16px',
        }}
        bodyStyle={{
          padding: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          height: '100%',
        }}
      >
        {/* 图标容器 - 玻璃拟态效果 */}
        <motion.div 
          className="glass-effect rounded-2xl p-4"
          style={{
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
          }}
          whileHover={{ scale: 1.1, rotate: 5 }}
          transition={{ duration: 0.2 }}
        >
          <div style={{ 
            fontSize: '32px', 
            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            {icon}
          </div>
        </motion.div>
        
        {/* 数据显示区域 */}
        <div style={{ flex: 1 }}>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Statistic
              title={
                <span className="text-gray-600 dark:text-gray-600 text-sm font-medium mb-2">
                  {title}
                </span>
              }
              value={value}
              prefix={prefix}
              suffix={suffix}
              valueStyle={{
                fontSize: '28px',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #1f2937 0%, #374151 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                ...valueStyle,
              }}
            />
          </motion.div>
        </div>
      </Card>
    </motion.div>
  );
};