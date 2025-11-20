import React from 'react';
import { Card } from 'antd';
import { Line } from '@ant-design/charts';
import { motion } from 'framer-motion';

interface ChartDataPoint {
  x: string | number;
  y: number;
  category?: string;
}

interface ChartCardProps {
  title: string;
  chartData: ChartDataPoint[];
  loading?: boolean;
  height?: number;
  chartType?: 'line' | 'area' | 'column';
  icon?: React.ReactNode;
  description?: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  chartData,
  loading = false,
  height = 300,
  chartType = 'line',
}) => {
  const chartConfig = {
    data: chartData,
    xField: 'x',
    yField: 'y',
    height: height - 100,
    smooth: true,
    color: '#3b82f6', // 使用新的主色调
    point: {
      size: 5,
      shape: 'circle',
      style: {
        fill: '#3b82f6',
        stroke: '#ffffff',
        lineWidth: 2,
        shadowColor: 'rgba(59, 130, 246, 0.3)',
        shadowBlur: 10,
      },
    },
    line: {
      style: {
        stroke: '#3b82f6',
        lineWidth: 3,
        shadowColor: 'rgba(59, 130, 246, 0.2)',
        shadowBlur: 8,
      },
    },
    areaStyle: chartType === 'area' ? {
      fill: 'l(270) 0:#ffffff 0.3:#dbeafe 0.7:#3b82f6 1:#2563eb',
    } : undefined,
    tooltip: {
      showMarkers: true,
      shared: true,
      domStyles: {
        'g2-tooltip': {
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
        },
      },
    },
    theme: {
      geometries: {
        point: {
          circle: {
            active: {
              style: {
                r: 8,
                fillOpacity: 1,
                stroke: '#ffffff',
                lineWidth: 2,
              },
            },
          },
        },
      },
    },
    animation: {
      appear: {
        animation: 'wave-in',
        duration: 1500,
        easing: 'easeOutQuart',
      },
    },
  };

  return (
    <motion.div
      whileHover={{ 
        y: -2,
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.1)'
      }}
      transition={{ duration: 0.3 }}
      className="h-full"
    >
      <Card
        title={
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-1 h-6 bg-gradient-to-b from-blue-500 to-purple-600 rounded-full"></div>
            <span className="text-lg font-semibold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
              {title}
            </span>
          </motion.div>
        }
        loading={loading}
        className="border-0 shadow-lg hover:shadow-xl transition-all duration-300"
        style={{
          height: height,
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          borderRadius: '20px',
          overflow: 'hidden',
        }}
        bodyStyle={{
          padding: '24px',
          background: 'transparent',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          {chartData && chartData.length > 0 ? (
            <div className="relative">
              <Line {...chartConfig} />
              {/* 图表装饰性元素 */}
              <div className="absolute top-4 right-4 w-2 h-2 bg-blue-500 rounded-full animate-pulse opacity-60"></div>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center text-gray-500 dark:text-gray-600"
              style={{
                height: height - 120,
              }}
            >
              <div className="w-16 h-16 bg-gradient-to-br from-gray-200 to-gray-300 rounded-2xl flex items-center justify-center mb-4">
                <div className="w-8 h-8 bg-gray-400 rounded-lg opacity-50"></div>
              </div>
              <span className="text-sm font-medium">暂无数据</span>
              <span className="text-xs mt-1 opacity-60">请等待数据加载</span>
            </motion.div>
          )}
        </motion.div>
      </Card>
    </motion.div>
  );
};