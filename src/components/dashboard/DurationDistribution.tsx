import React from 'react';
import { Card, Empty } from 'antd';
import { Column } from '@ant-design/charts';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';

interface DurationDistributionProps {
  data: Array<{
    range: string; // 时长范围
    count: number; // 数量
  }>;
  loading?: boolean;
}

export const DurationDistribution: React.FC<DurationDistributionProps> = ({
  data,
  loading = false
}) => {
  const config = {
    data,
    xField: 'range',
    yField: 'count',
    label: {
      position: 'top' as const,
      style: {
        fill: '#4b5563',
        fontSize: 12,
        fontWeight: 500,
      },
    },
    xAxis: {
      label: {
        style: {
          fill: '#6b7280',
          fontSize: 12,
        },
      },
    },
    yAxis: {
      label: {
        style: {
          fill: '#6b7280',
          fontSize: 12,
        },
      },
      title: {
        text: '测试用例数量',
        style: {
          fill: '#4b5563',
          fontSize: 12,
        },
      },
    },
    columnStyle: {
      radius: [8, 8, 0, 0],
    },
    color: (datum: any) => {
      // 根据时长范围设置不同颜色
      const rangeOrder = ['0-1分钟', '1-2分钟', '2-3分钟', '3-5分钟', '5-10分钟', '>10分钟'];
      const index = rangeOrder.indexOf(datum.range);
      const colors = ['#10b981', '#22c55e', '#facc15', '#f59e0b', '#f97316', '#ef4444'];
      return colors[index] || '#3b82f6';
    },
    tooltip: {
      formatter: (datum: any) => {
        return {
          name: '数量',
          value: `${datum.count} 个`,
        };
      },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <Card
        title={
          <div className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-blue-500" />
            <span className="font-semibold">执行时长分布</span>
          </div>
        }
        bordered={false}
        className="shadow-sm hover:shadow-md transition-shadow"
      >
        {data.length === 0 ? (
          <div className="h-64 flex items-center justify-center">
            <Empty description="暂无执行时长数据" />
          </div>
        ) : (
          <>
            <div className="h-64">
              <Column {...config} />
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <div className="text-gray-600">
                <p>📊 执行时长分布统计</p>
              </div>
            </div>
          </>
        )}
      </Card>
    </motion.div>
  );
};
