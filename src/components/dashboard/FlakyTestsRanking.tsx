import React from 'react';
import { Card, Progress, Tag, Tooltip, Empty } from 'antd';
import { motion } from 'framer-motion';
import { TrendingUp, AlertCircle } from 'lucide-react';

interface FlakyTest {
  id: number;
  name: string;
  failureRate: number; // 失败率 0-100
  totalRuns: number;
  lastFailure: string;
  severity: 'high' | 'medium' | 'low';
}

interface FlakyTestsRankingProps {
  data: FlakyTest[];
  maxItems?: number;
  loading?: boolean;
}

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'high':
      return 'red';
    case 'medium':
      return 'orange';
    case 'low':
      return 'yellow';
    default:
      return 'default';
  }
};

const getSeverityText = (severity: string) => {
  switch (severity) {
    case 'high':
      return '高危';
    case 'medium':
      return '中危';
    case 'low':
      return '低危';
    default:
      return '';
  }
};

export const FlakyTestsRanking: React.FC<FlakyTestsRankingProps> = ({
  data,
  maxItems = 5,
  loading = false,
}) => {
  const displayData = data.slice(0, maxItems);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <Card
        title={
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-orange-500" />
              <span className="font-semibold">不稳定用例排名 Top {maxItems}</span>
            </div>
            <Tooltip title="失败率高于15%的测试用例">
              <AlertCircle className="h-4 w-4 text-gray-600 cursor-help" />
            </Tooltip>
          </div>
        }
        bordered={false}
        className="shadow-sm hover:shadow-md transition-shadow"
      >
        {data.length === 0 ? (
          <div className="h-64 flex items-center justify-center">
            <Empty description="暂无不稳定用例数据" />
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {displayData.map((test, index) => (
            <motion.div
              key={test.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * index }}
              className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold">
                      {index + 1}
                    </span>
                    <span className="font-medium text-gray-900">{test.name}</span>
                  </div>
                  <div className="flex items-center space-x-3 text-sm text-gray-700 ml-8">
                    <span>总运行: {test.totalRuns}次</span>
                    <span>•</span>
                    <span>上次失败: {test.lastFailure}</span>
                  </div>
                </div>
                <Tag color={getSeverityColor(test.severity)}>
                  {getSeverityText(test.severity)}
                </Tag>
              </div>
              <div className="ml-8">
                <div className="flex items-center space-x-3">
                  <Progress
                    percent={test.failureRate}
                    status={test.failureRate > 30 ? 'exception' : 'active'}
                    strokeColor={
                      test.failureRate > 30
                        ? '#ef4444'
                        : test.failureRate > 20
                        ? '#f59e0b'
                        : '#facc15'
                    }
                    showInfo={false}
                    className="flex-1"
                  />
                  <span className="text-sm font-semibold text-gray-700 w-12 text-right">
                    {test.failureRate}%
                  </span>
                </div>
              </div>
            </motion.div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800">
                💡 <span className="font-medium">建议:</span> 优先修复高危不稳定用例,提升测试可靠性
              </p>
            </div>
          </>
        )}
      </Card>
    </motion.div>
  );
};
