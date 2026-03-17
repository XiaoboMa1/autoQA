import React from 'react';
import { Card, List, Avatar, Typography, Tag } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { Clock, CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const { Text } = Typography;

interface Activity {
  id?: string | number;
  avatar?: string;
  description: string;
  timestamp: string;
  status?: 'success' | 'error' | 'warning' | 'info';
  user?: string;
}

interface RecentActivityCardProps {
  title: string;
  activities: Activity[];
  loading?: boolean;
  maxItems?: number;
}

export const RecentActivityCard: React.FC<RecentActivityCardProps> = ({
  title,
  activities,
  loading = false,
  maxItems = 5,
}) => {
  const displayActivities = activities.slice(0, maxItems);

  const getStatusIcon = (status?: string) => {
    const iconProps = { size: 14 };
    switch (status) {
      case 'success':
        return <CheckCircle {...iconProps} className="text-green-500" />;
      case 'error':
        return <XCircle {...iconProps} className="text-red-500" />;
      case 'warning':
        return <AlertCircle {...iconProps} className="text-yellow-500" />;
      case 'info':
        return <Info {...iconProps} className="text-blue-500" />;
      default:
        return <Clock {...iconProps} className="text-gray-600" />;
    }
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    
    const statusConfig = {
      success: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', label: '成功' },
      error: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: '失败' },
      warning: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', label: '警告' },
      info: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', label: '进行中' },
    };

    const config = statusConfig[status as keyof typeof statusConfig];
    if (!config) return null;

    return (
      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {getStatusIcon(status)}
        {config.label}
      </div>
    );
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
            <div className="w-1 h-6 bg-gradient-to-b from-green-500 to-blue-600 rounded-full"></div>
            <span className="text-lg font-semibold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
              {title}
            </span>
          </motion.div>
        }
        loading={loading}
        className="border-0 shadow-lg hover:shadow-xl transition-all duration-300"
        style={{
          height: '100%',
          minHeight: '450px',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          borderRadius: '20px',
          overflow: 'hidden',
        }}
        styles={{
          body: {
            padding: '24px',
            background: 'transparent',
          }
        }}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <AnimatePresence>
            <div className="space-y-4">
              {displayActivities.map((item, index) => (
                <motion.div
                  key={item.id || index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ 
                    scale: 1.02,
                    backgroundColor: 'rgba(59, 130, 246, 0.05)'
                  }}
                  className="p-4 rounded-xl border border-gray-100 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm"
                >
                  <div className="flex items-start gap-4">
                    {/* 头像 */}
                    <motion.div
                      whileHover={{ scale: 1.1 }}
                      className="relative"
                    >
                      <Avatar 
                        src={item.avatar} 
                        icon={!item.avatar && <UserOutlined />}
                        size={40}
                        className="shadow-md"
                        style={{
                          backgroundColor: item.avatar ? undefined : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                        }}
                      />
                      {/* 状态指示器 */}
                      <div className="absolute -bottom-1 -right-1 bg-white dark:bg-gray-800 rounded-full p-0.5">
                        {getStatusIcon(item.status)}
                      </div>
                    </motion.div>
                    
                    {/* 内容区域 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <Text className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-5">
                          {item.description}
                        </Text>
                        {getStatusBadge(item.status)}
                      </div>
                      
                      <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-600">
                        {item.user && (
                          <span className="font-medium">{item.user}</span>
                        )}
                        <div className="flex items-center gap-1">
                          <Clock size={12} />
                          <span>{item.timestamp}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
          
          {activities.length > maxItems && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 text-center"
            >
              <Text className="text-sm text-gray-700 dark:text-gray-600">
                显示最近 {maxItems} 条，共 {activities.length} 条活动
              </Text>
            </motion.div>
          )}
          
          {displayActivities.length === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-600"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded-2xl flex items-center justify-center mb-4">
                <Clock size={24} className="opacity-50" />
              </div>
              <span className="text-sm font-medium">暂无活动记录</span>
              <span className="text-xs mt-1 opacity-60">活动将在这里显示</span>
            </motion.div>
          )}
        </motion.div>
      </Card>
    </motion.div>
  );
};