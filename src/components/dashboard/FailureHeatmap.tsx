import React from 'react';
import { Card, Empty } from 'antd';
import { Heatmap } from '@ant-design/charts';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

interface FailureHeatmapProps {
  data: Array<{
    x: string; // 日期
    y: string; // 测试用例名称
    value: number; // 失败次数
  }>;
  loading?: boolean;
}

export const FailureHeatmap: React.FC<FailureHeatmapProps> = ({ data, loading = false }) => {
  const config = {
    data,
    xField: 'x',
    yField: 'y',
    colorField: 'value',
    color: ['#e5e7eb', '#fef3c7', '#fcd34d', '#f59e0b', '#dc2626'],
    legend: {
      position: 'bottom' as const,
    },
    tooltip: {
      fields: ['x', 'y', 'value'],
      formatter: (datum: any) => {
        return {
          name: '失败次数',
          value: datum.value,
        };
      },
    },
    xAxis: {
      label: {
        style: {
          fontSize: 12,
          fill: '#6b7280',
        },
      },
    },
    yAxis: {
      label: {
        style: {
          fontSize: 12,
          fill: '#6b7280',
        },
      },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card
        title={
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <span className="font-semibold">测试失败热力图</span>
          </div>
        }
        bordered={false}
        className="shadow-sm hover:shadow-md transition-shadow"
      >
        {data.length === 0 ? (
          <div className="h-64 flex items-center justify-center">
            <Empty description="暂无失败数据" />
          </div>
        ) : (
          <>
            <div className="h-64">
              <Heatmap {...config} />
            </div>
            <div className="mt-4 text-sm text-gray-600">
              <p>📊 快速定位高频失败的测试用例和时间段</p>
            </div>
          </>
        )}
      </Card>
    </motion.div>
  );
};
