import React, { useState, useEffect, useCallback } from 'react';
import { 
  Card, Row, Col, Statistic, Button, Space, 
  Table, Progress, Alert, message, Spin, Empty 
} from 'antd';
import {
  RiseOutlined, ApiOutlined,
  DatabaseOutlined, ReloadOutlined, DeleteOutlined,
  TrophyOutlined
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area, CartesianGrid, Legend } from 'recharts';
import { Table2, LayoutGrid, PieChart as PieChartIcon, Activity, LineChartIcon, BarChart3, AreaChartIcon } from 'lucide-react';
import clsx from 'clsx';

// 定义缓存统计数据类型
interface CacheBreakdown {
  requests: number;
  hits: number;
  misses: number;
  hitRate: number | string;
}

interface CacheTableRecord {
  key: string;
  icon: string;
  type: string;
  requests: number;
  hits: number;
  misses: number;
  hitRate: number;
  description: string;
}

interface CacheStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  totalElements: number;
  memoryUsage: number;
  estimatedSavings: {
    apiCalls: number;
    cost: string;
    time: string;
  };
  status: 'excellent' | 'good' | 'normal' | 'poor';
  breakdown?: {
    element: CacheBreakdown;
    operation: CacheBreakdown;
    assertion: CacheBreakdown;
  };
  trendData?: Array<{
    time: string;
    hitRate: number;
    requests: number;
  }>;
}

// 卡片动画配置
const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

// 状态颜色配置
const getStatusColor = (hitRate: number) => {
  if (hitRate >= 60) return '#52c41a'; // 绿色 - 优秀
  if (hitRate >= 40) return '#faad14'; // 橙色 - 良好
  if (hitRate >= 20) return '#ff7a45'; // 橘色 - 一般
  return '#f5222d'; // 红色 - 需要优化
};

const getStatusText = (hitRate: number) => {
  if (hitRate >= 60) return { text: '优秀', icon: '🏆' };
  if (hitRate >= 40) return { text: '良好', icon: '👍' };
  if (hitRate >= 20) return { text: '一般', icon: '📊' };
  return { text: '需优化', icon: '⚠️' };
};

const getStatusBadge = (status: string) => {
  const badges = {
    excellent: { color: '#52c41a', text: '优秀', icon: '🏆' },
    good: { color: '#faad14', text: '良好', icon: '👍' },
    normal: { color: '#ff7a45', text: '一般', icon: '📊' },
    poor: { color: '#f5222d', text: '需优化', icon: '⚠️' }
  };
  return badges[status as keyof typeof badges] || badges.normal;
};

// 统一处理 hitRate 的格式化（处理字符串和数字类型）
const formatHitRate = (rate: number | string | undefined | null): string => {
  if (rate === undefined || rate === null) return '0.0';
  const numRate = typeof rate === 'string' ? parseFloat(rate) : rate;
  return isNaN(numRate) ? '0.0' : numRate.toFixed(1);
};

const CacheStatsPage: React.FC = () => {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'dashboard' | 'category' | 'classic' | 'detailed'>('dashboard'); // 视图模式：概览/分类/经典/详细
  const [chartStyle, setChartStyle] = useState<'line' | 'bar' | 'area'>('line'); // 趋势图样式：折线图/柱状图/面积图

  // 获取统计数据
  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      console.log('🔍 正在获取缓存统计...');
      console.log('📍 API地址:', '/api/config/cache/stats');
      
      const response = await fetch('/api/config/cache/stats');
      console.log('📡 响应状态:', response.status);
      
      const data = await response.json();
      console.log('📦 响应数据:', data);
      
      if (data.success) {
        console.log('✅ 数据加载成功:', data.data);
        setStats(data.data);
        setError(null);
        if (!initialLoad) {
          message.success('缓存统计加载成功');
        }
      } else {
        const errorMsg = data.error || '未知错误';
        console.error('❌ API返回失败:', errorMsg);
        setError(`API错误: ${errorMsg}`);
        message.error(`获取统计失败: ${errorMsg}`);
      }
    } catch (error: unknown) {
      console.error('❌ 获取缓存统计失败:', error);
      const errorMsg = error instanceof Error ? error.message : '未知网络错误';
      setError(`网络错误: ${errorMsg}`);
      message.error('网络错误，无法获取统计数据');
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [initialLoad]);

  // 清空缓存
  const clearCache = async () => {
    try {
      const response = await fetch('/api/config/cache/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      if (data.success) {
        message.success('缓存已清空');
        fetchStats(); // 刷新统计
      } else {
        message.error('清空缓存失败');
      }
    } catch (error) {
      console.error('清空缓存失败:', error);
      message.error('清空失败，请重试');
    }
  };

  useEffect(() => {
    fetchStats();
    // 每30秒自动刷新
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // 获取趋势数据（从后端返回或生成模拟数据）
  const getTrendData = () => {
    if (!stats) {
      return [];
    }
    
    // 如果后端提供了趋势数据，直接使用
    if (stats.trendData && stats.trendData.length > 0) {
      return stats.trendData;
    }
    
    // 如果没有趋势数据，基于当前统计生成一个数据点
    // 这样至少能显示当前状态
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    return [
      {
        time: currentTime,
        hitRate: stats.hitRate || 0,
        requests: stats.totalRequests || 0
      }
    ];
  };

  // 饼图数据
  const getPieData = () => {
    if (!stats) return [];
    
    // 如果没有任何数据，返回一个占位数据
    if (stats.totalRequests === 0) {
      return [
        { name: '暂无数据', value: 1, color: '#e5e7eb' }
      ];
    }
    
    // 如果只有命中没有未命中，或者只有未命中没有命中
    if (stats.cacheHits === 0 && stats.cacheMisses === 0) {
      return [
        { name: '暂无数据', value: 1, color: '#e5e7eb' }
      ];
    }
    
    const data = [];
    if (stats.cacheHits > 0) {
      data.push({ name: '缓存命中', value: stats.cacheHits, color: '#52c41a' });
    }
    if (stats.cacheMisses > 0) {
      data.push({ name: '缓存未命中', value: stats.cacheMisses, color: '#f5222d' });
    }
    
    return data;
  };

  // 初始加载状态
  if (initialLoad && loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <Spin size="large" />
        <p className="mt-4 text-gray-500">加载缓存统计中...</p>
      </div>
    );
  }

  // 无数据状态
  if (!stats && !loading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">📊 缓存统计</h2>
          <p className="text-gray-600">实时监控AI智能缓存效果</p>
        </div>
        
        {error && (
          <Alert
            message="⚠️ 加载失败"
            description={
              <div>
                <p className="mb-2"><strong>错误信息:</strong> {error}</p>
                <p className="mb-2"><strong>排查步骤:</strong></p>
                <ol className="ml-4 list-decimal">
                  <li>确认服务器已启动 (运行 <code>npm run dev</code>)</li>
                  <li>检查服务器是否运行在 <code>http://localhost:5000</code></li>
                  <li>打开浏览器开发者工具查看Network标签中的请求详情</li>
                  <li>检查控制台是否有CORS或其他错误</li>
                </ol>
                <p className="mt-2">
                  <strong>测试API:</strong> 在浏览器中访问{' '}
                  <a 
                    href="http://localhost:5000/api/config/cache/stats" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 underline"
                  >
                    http://localhost:5000/api/config/cache/stats
                  </a>
                </p>
              </div>
            }
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        
        <Empty
          description={error ? "无法连接到服务器" : "暂无缓存数据"}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Space>
            <Button type="primary" icon={<ReloadOutlined />} onClick={fetchStats}>
              重试获取统计
            </Button>
            <Button 
              onClick={() => window.open('http://localhost:5000/api/config/cache/stats', '_blank')}
            >
              直接访问API
            </Button>
          </Space>
        </Empty>
      </div>
    );
  }

  const statusBadge = stats ? getStatusBadge(stats.status) : null;
  const trendData = getTrendData();
  const pieData = getPieData();

  // 渲染趋势图的样式切换器
  const renderChartStyleSwitcher = () => (
    <div className="inline-flex items-center bg-white rounded-lg border border-gray-200 shadow-sm p-1">
      <button
        onClick={() => setChartStyle('line')}
        className={clsx(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
          chartStyle === 'line'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        )}
        title="折线图"
      >
        <LineChartIcon className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">折线图</span>
      </button>
      <button
        onClick={() => setChartStyle('bar')}
        className={clsx(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
          chartStyle === 'bar'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        )}
        title="柱状图"
      >
        <BarChart3 className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">柱状图</span>
      </button>
      <button
        onClick={() => setChartStyle('area')}
        className={clsx(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
          chartStyle === 'area'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        )}
        title="面积图"
      >
        <AreaChartIcon className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">面积图</span>
      </button>
    </div>
  );

  // 渲染趋势图内容
  const renderTrendChart = () => {
    // 如果没有数据，显示提示信息
    if (!trendData || trendData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-[300px] text-gray-400">
          <Activity className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-sm">暂无趋势数据</p>
          <p className="text-xs mt-2">系统会随着使用时间积累趋势数据</p>
        </div>
      );
    }

    const commonProps = {
      data: trendData,
    };

    const commonAxisProps = {
      xAxis: (
        <XAxis 
          dataKey="time" 
          stroke="#94a3b8"
          style={{ fontSize: 12 }}
          label={{ value: '时间', position: 'insideBottom', offset: -5, style: { fontSize: 11, fill: '#64748b' } }}
        />
      ),
      yAxis: (
        <YAxis 
          stroke="#94a3b8"
          style={{ fontSize: 12 }}
          label={{ value: '数值', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#64748b' } }}
        />
      ),
      tooltip: (
        <RechartsTooltip 
          contentStyle={{ 
            backgroundColor: '#fff', 
            border: '1px solid #e2e8f0',
            borderRadius: 8
          }}
        />
      ),
      grid: <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />,
      legend: <Legend wrapperStyle={{ fontSize: 12 }} />
    };

    switch (chartStyle) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart {...commonProps}>
              {commonAxisProps.grid}
              {commonAxisProps.xAxis}
              {commonAxisProps.yAxis}
              {commonAxisProps.tooltip}
              {commonAxisProps.legend}
              <Bar 
                dataKey="hitRate" 
                fill="#1890ff" 
                name="命中率 (%)"
                radius={[8, 8, 0, 0]}
              />
              <Bar 
                dataKey="requests" 
                fill="#52c41a" 
                name="请求数"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        );
      
      case 'area':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart {...commonProps}>
              {commonAxisProps.grid}
              {commonAxisProps.xAxis}
              {commonAxisProps.yAxis}
              {commonAxisProps.tooltip}
              {commonAxisProps.legend}
              <defs>
                <linearGradient id="colorHitRate" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1890ff" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#1890ff" stopOpacity={0.1}/>
                </linearGradient>
                <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#52c41a" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#52c41a" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <Area 
                type="monotone" 
                dataKey="hitRate" 
                stroke="#1890ff" 
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorHitRate)"
                name="命中率 (%)"
              />
              <Area 
                type="monotone" 
                dataKey="requests" 
                stroke="#52c41a" 
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRequests)"
                name="请求数"
              />
            </AreaChart>
          </ResponsiveContainer>
        );
      
      case 'line':
      default:
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart {...commonProps}>
              {commonAxisProps.grid}
              {commonAxisProps.xAxis}
              {commonAxisProps.yAxis}
              {commonAxisProps.tooltip}
              {commonAxisProps.legend}
              <Line 
                type="monotone" 
                dataKey="hitRate" 
                stroke="#1890ff" 
                strokeWidth={3}
                dot={{ fill: '#1890ff', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
                name="命中率 (%)"
              />
              <Line 
                type="monotone" 
                dataKey="requests" 
                stroke="#52c41a" 
                strokeWidth={2}
                dot={{ fill: '#52c41a', strokeWidth: 2, r: 3 }}
                name="请求数"
              />
            </LineChart>
          </ResponsiveContainer>
        );
    }
  };

  return (
    <div style={{ padding: 24, backgroundColor: '#f9fafb', minHeight: 'calc(100vh - 64px)' }}>
      {/* 页面标题 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              📊 缓存统计
              {statusBadge && (
                <span
                  className="text-sm px-3 py-1 rounded-full font-medium"
                  style={{ backgroundColor: `${statusBadge.color}20`, color: statusBadge.color }}
                >
                  {statusBadge.icon} {statusBadge.text}
                </span>
              )}
            </h2>
            <p className="text-gray-600 mt-1">实时监控AI智能缓存效果，降低调用成本</p>
          </div>
          <Space>
            <Button 
              icon={<ReloadOutlined />}
              onClick={fetchStats}
              loading={loading}
              type="default"
            >
              刷新
            </Button>
            <Button 
              icon={<DeleteOutlined />}
              onClick={clearCache}
              danger
            >
              清空缓存
            </Button>
          </Space>
        </div>

        {/* 视图切换器 */}
        <div className="mt-4 inline-flex items-center bg-white rounded-lg border border-gray-200 shadow-sm p-1">
          <button
            onClick={() => setViewMode('dashboard')}
            className={clsx(
              'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
              viewMode === 'dashboard'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}
            title="概览视图 - 全方位数据监控"
          >
            <Activity className="w-4 h-4" />
            <span className="hidden sm:inline">概览视图</span>
          </button>
          <button
            onClick={() => setViewMode('category')}
            className={clsx(
              'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
              viewMode === 'category'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}
            title="分类视图 - 区分三种缓存类型"
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden sm:inline">分类视图</span>
          </button>
          <button
            onClick={() => setViewMode('classic')}
            className={clsx(
              'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
              viewMode === 'classic'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}
            title="经典视图 - 图表趋势分析"
          >
            <PieChartIcon className="w-4 h-4" />
            <span className="hidden sm:inline">经典视图</span>
          </button>
          <button
            onClick={() => setViewMode('detailed')}
            className={clsx(
              'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
              viewMode === 'detailed'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}
            title="详细视图 - 完整数据展示"
          >
            <Table2 className="w-4 h-4" />
            <span className="hidden sm:inline">详细视图</span>
          </button>
        </div>
      </motion.div>

      {/* 成功提示 */}
      {stats && stats.hitRate >= 40 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Alert
            message="🎉 AI优化已启用"
            description={`系统已自动启用智能缓存，当前命中率 ${stats.hitRate.toFixed(1)}%，已节省 ${stats.estimatedSavings.apiCalls} 次AI调用，预计节省费用 ${stats.estimatedSavings.cost}。`}
            type="success"
            showIcon
            closable
            style={{ marginBottom: 24 }}
          />
        </motion.div>
      )}

      {/* 优化建议 */}
      {stats && stats.hitRate < 40 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Alert
            message="💡 缓存命中率较低"
            description={
              <div>
                <p>建议采取以下措施提升缓存效果：</p>
                <ul className="mt-2 ml-4 list-disc">
                  <li>统一元素描述命名规范，使用更一致的描述词</li>
                  <li>增大缓存容量配置（当前容量可能不足）</li>
                  <li>延长缓存过期时间，保留更多历史数据</li>
                  <li>检查是否有大量动态元素导致缓存失效</li>
                </ul>
              </div>
            }
            type="warning"
            showIcon
            closable
            style={{ marginBottom: 24 }}
          />
        </motion.div>
      )}
      {/* 第一行：分类卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} lg={8}>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <Card
                  style={{ 
                    borderRadius: 12, 
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                  }}
                  styles={{ body: { padding: '20px' } }}
                >
                  <div className="text-white">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-semibold flex items-center gap-2">
                        <DatabaseOutlined /> 元素缓存
                      </span>
                      <span className="text-2xl font-bold">
                        {formatHitRate(stats?.breakdown?.element.hitRate)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-xs opacity-80">
                      <span>命中: {stats?.breakdown?.element.hits || 0}</span>
                      <span>总计: {stats?.breakdown?.element.requests || 0}</span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </Col>
            <Col xs={24} lg={8}>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Card
                  style={{ 
                    borderRadius: 12, 
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
                  }}
                  styles={{ body: { padding: '20px' } }}
                >
                  <div className="text-white">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-semibold flex items-center gap-2">
                        <ApiOutlined /> 操作缓存
                      </span>
                      <span className="text-2xl font-bold">
                        {formatHitRate(stats?.breakdown?.operation.hitRate)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-xs opacity-80">
                      <span>命中: {stats?.breakdown?.operation.hits || 0}</span>
                      <span>总计: {stats?.breakdown?.operation.requests || 0}</span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </Col>
            <Col xs={24} lg={8}>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <Card
                  style={{ 
                    borderRadius: 12, 
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
                  }}
                  styles={{ body: { padding: '20px' } }}
                >
                  <div className="text-white">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-semibold flex items-center gap-2">
                        <TrophyOutlined /> 断言缓存
                      </span>
                      <span className="text-2xl font-bold">
                        {formatHitRate(stats?.breakdown?.assertion.hitRate)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-xs opacity-80">
                      <span>命中: {stats?.breakdown?.assertion.hits || 0}</span>
                      <span>总计: {stats?.breakdown?.assertion.requests || 0}</span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </Col>
          </Row>
      {/* 指标卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between' }}>
        {/* 总请求数卡片 */}
        <Col xs={24} sm={12} lg={6}>
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.1 }}
          >
            <Card hoverable style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <Statistic
                title={<span style={{ fontSize: 14, fontWeight: 500 }}>总请求数</span>}
                value={stats?.totalRequests || 0}
                suffix="次"
                valueStyle={{ fontSize: 32, fontWeight: 700, color: '#1890ff' }}
                // prefix={<ApiOutlined />}
              />
              <div className="mt-2 text-sm text-gray-500">
                💰 总请求数 - 缓存命中数 - 缓存未命中数
              </div>
            </Card>
          </motion.div>
        </Col>
        {/* 缓存命中卡片 */}
        <Col xs={24} sm={12} lg={6}>
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.2 }}
          >
            <Card hoverable style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <Statistic
                title={<span style={{ fontSize: 14, fontWeight: 500 }}>缓存命中</span>}
                value={stats?.cacheHits || 0}
                suffix="次"
                valueStyle={{ fontSize: 32, fontWeight: 700, color: '#10b981' }}
                // prefix={<RiseOutlined />}
              />
              <div className="mt-2 text-sm text-gray-500">
                💰 总请求数 - 缓存未命中数
              </div>
            </Card>
          </motion.div>
        </Col>
        {/* 缓存未命中卡片 */}
        <Col xs={24} sm={12} lg={6}>
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.2 }}
          >
            <Card hoverable style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <Statistic
                title={<span style={{ fontSize: 14, fontWeight: 500 }}>缓存未命中</span>}
                value={stats?.cacheMisses || 0}
                suffix="次"
                valueStyle={{ fontSize: 32, fontWeight: 700, color: '#ef4444' }}
                // prefix={<FallOutlined />}
              />
              <div className="mt-2 text-sm text-gray-500">
                💰 总请求数 - 缓存命中数
              </div>
            </Card>
          </motion.div>
        </Col>
        {/* 缓存命中率卡片 */}
        <Col xs={24} sm={12} lg={6}>
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.1 }}
          >
            <Card hoverable style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <Statistic
                title={<span style={{ fontSize: 14, fontWeight: 500 }}>缓存命中率</span>}
                value={stats?.hitRate || 0}
                precision={1}
                suffix="%"
                valueStyle={{ 
                  color: getStatusColor(stats?.hitRate || 0),
                  fontSize: 32,
                  fontWeight: 700
                }}
                prefix={<RiseOutlined />}
              />
              <div className="mt-2 text-sm text-gray-500">
                {getStatusText(stats?.hitRate || 0).icon} {getStatusText(stats?.hitRate || 0).text}
              </div>
            </Card>
          </motion.div>
        </Col>
        {/* 节省费用卡片 */}
        <Col xs={24} sm={12} lg={6}>
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.3 }}
          >
            <Card hoverable style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <Statistic
                title={<span style={{ fontSize: 14, fontWeight: 500 }}>节省费用</span>}
                value={stats?.estimatedSavings?.cost || '0 元'}
                valueStyle={{ fontSize: 32, fontWeight: 700, color: '#52c41a' }}
                // prefix={<DollarOutlined />}
              />
              <div className="mt-2 text-sm text-gray-500">
                {/* ⏱️ 节省时间: {stats?.estimatedSavings?.time || '0ms'} */}
                💰 节省的调用次数 * 单次调用费用
              </div>
            </Card>
          </motion.div>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.4 }}
          >
            <Card hoverable style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <Statistic
                title={<span style={{ fontSize: 14, fontWeight: 500 }}>节省时间</span>}
                value={stats?.estimatedSavings.time || 0}
                suffix=""
                valueStyle={{ fontSize: 32, fontWeight: 700, color: '#3b82f6' }}
                // prefix={<RiseOutlined />}
              />
              <div className="mt-2 text-sm text-gray-500">
                💰 节省的调用次数 * 单次调用时间
              </div>
            </Card>
          </motion.div>
        </Col>
        {/* 缓存元素卡片 */}
        <Col xs={24} sm={12} lg={6}>
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.4 }}
          >
            <Card hoverable style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <Statistic
                title={<span style={{ fontSize: 14, fontWeight: 500 }}>缓存元素</span>}
                value={stats?.totalElements || 0}
                suffix="/ 1000"
                valueStyle={{ fontSize: 32, fontWeight: 700, color: '#4c55ee' }}
                // prefix={<DatabaseOutlined />}
              />
              <div className="mt-2 text-sm text-gray-500">
                💰 缓存元素总数
              </div>
            </Card>
          </motion.div>
        </Col>
        {/* 内存占用卡片 */}
        <Col xs={24} sm={12} lg={6}>
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.4 }}
          >
            <Card hoverable style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <Statistic
                title={<span style={{ fontSize: 14, fontWeight: 500 }}>内存占用</span>}
                value={stats?.memoryUsage || 0}
                suffix="KB"
                valueStyle={{ fontSize: 32, fontWeight: 700, color: '#8b5cf6' }}
                // prefix={<MemoryStickIcon/>}
              />
              <div className="mt-2 text-sm text-gray-500">
                💰 缓存元素数 * 单个缓存元素大小
              </div>
            </Card>
          </motion.div>
        </Col>
      </Row>

      {/* 概览视图 - 全方位数据监控 */}
      {viewMode === 'dashboard' && (
        <>
          {/* 新增指标行：展示基础统计数据 */}
          {/* <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={12} sm={8} lg={4.8}>
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div className="text-gray-400 text-xs mb-1">📝 总请求数</div>
                <div className="text-xl font-bold text-gray-800">{stats?.totalRequests || 0} <span className="text-xs font-normal text-gray-400">次</span></div>
              </div>
            </Col>
            <Col xs={12} sm={8} lg={4.8}>
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div className="text-gray-400 text-xs mb-1">✅ 缓存命中</div>
                <div className="text-xl font-bold text-green-600">{stats?.cacheHits || 0} <span className="text-xs font-normal text-gray-400">次</span></div>
              </div>
            </Col>
            <Col xs={12} sm={8} lg={4.8}>
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div className="text-gray-400 text-xs mb-1">❌ 缓存未命中</div>
                <div className="text-xl font-bold text-red-500">{stats?.cacheMisses || 0} <span className="text-xs font-normal text-gray-400">次</span></div>
              </div>
            </Col>
            <Col xs={12} sm={8} lg={4.8}>
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div className="text-gray-400 text-xs mb-1">💾 内存占用</div>
                <div className="text-xl font-bold text-blue-500">{stats?.memoryUsage || 0} <span className="text-xs font-normal text-gray-400">KB</span></div>
              </div>
            </Col>
            <Col xs={12} sm={8} lg={4.8}>
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div className="text-gray-400 text-xs mb-1">📦 缓存元素数</div>
                <div className="text-xl font-bold text-purple-600">{stats?.totalElements || 0} <span className="text-xs font-normal text-gray-400">/ 1000</span></div>
              </div>
            </Col>
          </Row> */}

          

          {/* 第二行：图表 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {/* 趋势图 */}
            <Col xs={24} lg={16}>
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
                <Card 
                  title={<span style={{ fontSize: 16, fontWeight: 600 }}>📈 缓存命中趋势</span>}
                  style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                  extra={renderChartStyleSwitcher()}
                >
                  {renderTrendChart()}
                </Card>
              </motion.div>
            </Col>

            {/* 命中率分析 - 与详细视图保持一致 */}
            <Col xs={24} lg={8}>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
              >
                <Card 
                  title={<span style={{ fontSize: 16, fontWeight: 600 }}>🎯 命中率分析</span>}
                  style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', height: '100%' }}
                  styles={{ body: { padding: '0 24px 24px' } }}
                >
                  <div className="relative" style={{ height: 270 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="80%"
                          startAngle={180}
                          endAngle={0}
                          innerRadius={85}
                          outerRadius={115}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.color} 
                              stroke="none"
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    
                    {/* 中心文本 */}
                    <div className="absolute inset-0 flex flex-col items-center justify-end pb-8">
                      <span className="text-4xl font-bold" style={{ color: getStatusColor(stats?.hitRate || 0) }}>
                        {stats?.hitRate.toFixed(1)}%
                      </span>
                      <span className="text-gray-500 text-sm font-medium">综合命中率</span>
                    </div>
                  </div>

                  {/* 底部指标说明 */}
                  <div className="flex justify-around items-center pt-2 border-t border-gray-100">
                    <div className="text-center">
                      <div className="text-lg font-bold text-blue-500">{stats?.totalRequests || 0}</div>
                      <div className="text-xs text-gray-400">总请求</div>
                    </div>
                    <div className="w-px h-8 bg-gray-100" />
                    <div className="text-center">
                      <div className="text-lg font-bold text-green-600">{stats?.cacheHits || 0}</div>
                      <div className="text-xs text-gray-400">命中</div>
                    </div>
                    <div className="w-px h-8 bg-gray-100" />
                    <div className="text-center">
                      <div className="text-lg font-bold text-red-500">{stats?.cacheMisses || 0}</div>
                      <div className="text-xs text-gray-400">未命中</div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </Col>
          </Row>

          {/* 节省估算卡片 */}
          {/* <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} lg={8}>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                <Card 
                  title={<span style={{ fontSize: 16, fontWeight: 600 }}>💰 节省估算</span>}
                  style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                >
                  <div className="space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                        <ApiOutlined style={{ fontSize: 24 }} />
                      </div>
                      <div>
                        <div className="text-gray-400 text-sm">节省AI调用</div>
                        <div className="text-2xl font-bold text-blue-600">{stats?.estimatedSavings.apiCalls} 次</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                        <DollarOutlined style={{ fontSize: 24 }} />
                      </div>
                      <div>
                        <div className="text-gray-400 text-sm">节省费用</div>
                        <div className="text-2xl font-bold text-green-600">{stats?.estimatedSavings.cost}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
                        <RiseOutlined style={{ fontSize: 24 }} />
                      </div>
                      <div>
                        <div className="text-gray-400 text-sm">节省时间</div>
                        <div className="text-2xl font-bold text-purple-600">{stats?.estimatedSavings.time}</div>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </Col>
          </Row> */}

          {/* 第四行：详细统计信息（与详细视图保持一致） */}
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
                <Card 
                  title={<span style={{ fontSize: 16, fontWeight: 600 }}>📊 详细统计信息</span>}
                  style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                  extra={
                    <div>
                      <span className="text-sm text-gray-500 mr-2">缓存容量使用率</span>
                      <Progress 
                        percent={((stats?.totalElements || 0) / 10)} 
                        status={
                          (stats?.totalElements || 0) > 900 ? 'exception' : 
                          (stats?.totalElements || 0) > 700 ? 'normal' : 'active'
                        }
                        strokeColor={{
                          '0%': '#108ee9',
                          '100%': '#87d068',
                        }}
                        style={{ width: 200 }}
                      />
                    </div>
                  }
                >
                  <Table
                    size="middle"
                    pagination={false}
                    bordered
                    columns={[
                      { 
                        title: '指标名称', 
                        dataIndex: 'metric', 
                        width: 180,
                        render: (text) => <span className="font-medium">{text}</span>
                      },
                      { 
                        title: '数值', 
                        dataIndex: 'value', 
                        width: 250,
                        render: (text) => <span className="text-blue-600 font-semibold">{text}</span>
                      },
                      { 
                        title: '说明', 
                        dataIndex: 'description',
                        render: (text) => <span className="text-gray-600">{text}</span>
                      }
                    ]}
                    dataSource={[
                      {
                        key: '1',
                        metric: '📝 总请求数',
                        value: `${stats?.totalRequests || 0} 次`,
                        description: '所有缓存请求的总数量（包含元素、操作、断言）'
                      },
                      {
                        key: '2',
                        metric: '✅ 缓存命中',
                        value: `${stats?.cacheHits || 0} 次`,
                        description: '从缓存直接获取，无需调用AI，显著提升速度'
                      },
                      {
                        key: '3',
                        metric: '❌ 缓存未命中',
                        value: `${stats?.cacheMisses || 0} 次`,
                        description: '需要调用AI进行识别，消耗token和时间'
                      },
                      {
                        key: '4',
                        metric: '🔍 元素缓存请求',
                        value: `${stats?.breakdown?.element.requests || 0} 次 (命中率: ${formatHitRate(stats?.breakdown?.element.hitRate)}%)`,
                        description: '页面元素定位识别请求'
                      },
                      {
                        key: '5',
                        metric: '⚡ 操作缓存请求',
                        value: `${stats?.breakdown?.operation.requests || 0} 次 (命中率: ${formatHitRate(stats?.breakdown?.operation.hitRate)}%)`,
                        description: '测试操作步骤解析请求'
                      },
                      {
                        key: '6',
                        metric: '✓ 断言缓存请求',
                        value: `${stats?.breakdown?.assertion.requests || 0} 次 (命中率: ${formatHitRate(stats?.breakdown?.assertion.hitRate)}%)`,
                        description: '断言验证逻辑解析请求'
                      },
                      {
                        key: '7',
                        metric: '💾 内存占用',
                        value: `${stats?.memoryUsage || 0} KB`,
                        description: '当前缓存占用的内存大小'
                      },
                      {
                        key: '8',
                        metric: '📦 缓存元素数',
                        value: `${stats?.totalElements || 0} / 1000`,
                        description: '已缓存的元素数量及容量上限'
                      },
                      {
                        key: '9',
                        metric: '💰 节省成本',
                        value: stats?.estimatedSavings?.cost || '0 元',
                        description: '根据token使用量估算的节省费用'
                      },
                      {
                        key: '10',
                        metric: '⚡ 节省时间',
                        value: stats?.estimatedSavings?.time || '0ms',
                        description: '缓存避免API调用节省的累计时间'
                      }
                    ]}
                  />
                </Card>
              </motion.div>
            </Col>
          </Row>
        </>
      )}

      {/* 分类视图 - 三种缓存类型独立展示 */}
      {viewMode === 'category' && (
        <>
          {/* 分类缓存统计 - 新增美观设计 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* 元素缓存 */}
        <Col xs={24} lg={8}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card
              hoverable
              style={{ 
                borderRadius: 12, 
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              }}
              styles={{ body: { padding: '24px' } }}
            >
              <div className="text-white">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-lg font-semibold flex items-center gap-2">
                    <DatabaseOutlined style={{ fontSize: 24 }} />
                    <span>元素缓存</span>
                  </div>
                  <div className="text-3xl opacity-20">🔍</div>
                </div>
                
                <div className="mb-3">
                  <div className="text-4xl font-bold mb-1">
                    {formatHitRate(stats?.breakdown?.element.hitRate)}%
                  </div>
                  <div className="text-sm opacity-90">命中率</div>
                </div>

                <div className="space-y-2 text-sm opacity-90">
                  <div className="flex justify-between">
                    <span>总请求:</span>
                    <span className="font-semibold">{stats?.breakdown?.element.requests || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>命中:</span>
                    <span className="font-semibold text-green-300">{stats?.breakdown?.element.hits || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>未命中:</span>
                    <span className="font-semibold text-red-300">{stats?.breakdown?.element.misses || 0}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/20">
                  <div className="text-xs opacity-80">
                    💡 识别页面元素位置（输入框、按钮等）
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </Col>

        {/* 操作缓存 */}
        <Col xs={24} lg={8}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <Card
              hoverable
              style={{ 
                borderRadius: 12, 
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
              }}
              styles={{ body: { padding: '24px' } }}
            >
              <div className="text-white">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-lg font-semibold flex items-center gap-2">
                    <ApiOutlined style={{ fontSize: 24 }} />
                    <span>操作缓存</span>
                  </div>
                  <div className="text-3xl opacity-20">⚡</div>
                </div>
                
                <div className="mb-3">
                  <div className="text-4xl font-bold mb-1">
                    {formatHitRate(stats?.breakdown?.operation.hitRate)}%
                  </div>
                  <div className="text-sm opacity-90">命中率</div>
                </div>

                <div className="space-y-2 text-sm opacity-90">
                  <div className="flex justify-between">
                    <span>总请求:</span>
                    <span className="font-semibold">{stats?.breakdown?.operation.requests || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>命中:</span>
                    <span className="font-semibold text-green-300">{stats?.breakdown?.operation.hits || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>未命中:</span>
                    <span className="font-semibold text-red-300">{stats?.breakdown?.operation.misses || 0}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/20">
                  <div className="text-xs opacity-80">
                    💡 解析测试操作步骤（点击、输入等）
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </Col>

        {/* 断言缓存 */}
        <Col xs={24} lg={8}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <Card
              hoverable
              style={{ 
                borderRadius: 12, 
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
              }}
              styles={{ body: { padding: '24px' } }}
            >
              <div className="text-white">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-lg font-semibold flex items-center gap-2">
                    <TrophyOutlined style={{ fontSize: 24 }} />
                    <span>断言缓存</span>
                  </div>
                  <div className="text-3xl opacity-20">✓</div>
                </div>
                
                <div className="mb-3">
                  <div className="text-4xl font-bold mb-1">
                    {formatHitRate(stats?.breakdown?.assertion.hitRate)}%
                  </div>
                  <div className="text-sm opacity-90">命中率</div>
                </div>

                <div className="space-y-2 text-sm opacity-90">
                  <div className="flex justify-between">
                    <span>总请求:</span>
                    <span className="font-semibold">{stats?.breakdown?.assertion.requests || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>命中:</span>
                    <span className="font-semibold text-green-300">{stats?.breakdown?.assertion.hits || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>未命中:</span>
                    <span className="font-semibold text-red-300">{stats?.breakdown?.assertion.misses || 0}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/20">
                  <div className="text-xs opacity-80">
                    💡 解析验证条件（文本、值、状态等）
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </Col>
      </Row>

          {/* 详细对比表格 - 在分类视图中也显示 */}
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.0 }}
              >
                <Card 
                  title={<span style={{ fontSize: 16, fontWeight: 600 }}>📊 缓存类型详细对比</span>}
                  style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                  extra={
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-sm text-gray-500 mr-2">缓存容量使用率</span>
                        <Progress 
                          percent={((stats?.totalElements || 0) / 10)} 
                          status={
                            (stats?.totalElements || 0) > 900 ? 'exception' : 
                            (stats?.totalElements || 0) > 700 ? 'normal' : 'active'
                          }
                          strokeColor={{
                            '0%': '#108ee9',
                            '100%': '#87d068',
                          }}
                          style={{ width: 200 }}
                        />
                      </div>
                    </div>
                  }
                >
                  <Table
                    size="middle"
                    columns={[
                      { 
                        title: '缓存类型', 
                        dataIndex: 'type', 
                        width: 150,
                        render: (text, record: CacheTableRecord) => (
                          <div className="flex items-center gap-2">
                            <span style={{ fontSize: 20 }}>{record.icon}</span>
                            <span className="font-semibold">{text}</span>
                          </div>
                        )
                      },
                      { 
                        title: '总请求数', 
                        dataIndex: 'requests', 
                        width: 120,
                        align: 'center' as const,
                        render: (text) => <span className="font-medium text-gray-700">{text}</span>
                      },
                      { 
                        title: '命中数', 
                        dataIndex: 'hits', 
                        width: 100,
                        align: 'center' as const,
                        render: (text) => <span className="font-semibold text-green-600">{text}</span>
                      },
                      { 
                        title: '未命中数', 
                        dataIndex: 'misses', 
                        width: 100,
                        align: 'center' as const,
                        render: (text) => <span className="font-semibold text-red-600">{text}</span>
                      },
                      { 
                        title: '命中率', 
                        dataIndex: 'hitRate',
                        width: 150,
                        align: 'center' as const,
                        render: (rate) => {
                          const numRate = typeof rate === 'string' ? parseFloat(rate) : rate;
                          return (
                            <div className="flex items-center justify-center gap-2">
                              <Progress 
                                type="circle" 
                                percent={numRate} 
                                width={50}
                                strokeColor={getStatusColor(numRate)}
                                format={(percent) => `${percent?.toFixed(1)}%`}
                              />
                            </div>
                          );
                        }
                      },
                      { 
                        title: '作用说明', 
                        dataIndex: 'description',
                        render: (text) => <span className="text-gray-600 text-sm">{text}</span>
                      }
                    ]}
                    dataSource={[
                      {
                        key: 'element',
                        icon: '🔍',
                        type: '元素缓存',
                        requests: stats?.breakdown?.element.requests || 0,
                        hits: stats?.breakdown?.element.hits || 0,
                        misses: stats?.breakdown?.element.misses || 0,
                        hitRate: parseFloat(formatHitRate(stats?.breakdown?.element.hitRate)),
                        description: '缓存页面元素定位信息，避免重复识别相同元素'
                      },
                      {
                        key: 'operation',
                        icon: '⚡',
                        type: '操作缓存',
                        requests: stats?.breakdown?.operation.requests || 0,
                        hits: stats?.breakdown?.operation.hits || 0,
                        misses: stats?.breakdown?.operation.misses || 0,
                        hitRate: parseFloat(formatHitRate(stats?.breakdown?.operation.hitRate)),
                        description: '缓存操作步骤解析结果，加速测试用例执行'
                      },
                      {
                        key: 'assertion',
                        icon: '✓',
                        type: '断言缓存',
                        requests: stats?.breakdown?.assertion.requests || 0,
                        hits: stats?.breakdown?.assertion.hits || 0,
                        misses: stats?.breakdown?.assertion.misses || 0,
                        hitRate: parseFloat(formatHitRate(stats?.breakdown?.assertion.hitRate)),
                        description: '缓存断言验证逻辑，提升验证效率'
                      }
                    ]}
                    pagination={false}
                    bordered
                    summary={() => (
                      <Table.Summary fixed>
                        <Table.Summary.Row style={{ backgroundColor: '#fafafa' }}>
                          <Table.Summary.Cell index={0}>
                            <div className="flex items-center gap-2">
                              <span style={{ fontSize: 20 }}>📊</span>
                              <span className="font-bold">总计</span>
                            </div>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={1} align="center">
                            <span className="font-bold text-gray-800">{stats?.totalRequests || 0}</span>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={2} align="center">
                            <span className="font-bold text-green-600">{stats?.cacheHits || 0}</span>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={3} align="center">
                            <span className="font-bold text-red-600">{stats?.cacheMisses || 0}</span>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={4} align="center">
                            <div className="flex items-center justify-center gap-2">
                              <Progress 
                                type="circle" 
                                percent={stats?.hitRate || 0} 
                                width={50}
                                strokeColor={getStatusColor(stats?.hitRate || 0)}
                                format={(percent) => `${percent?.toFixed(1)}%`}
                              />
                            </div>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={5}>
                            <div className="text-sm">
                              <div>💰 节省成本: <span className="font-semibold text-green-600">{stats?.estimatedSavings?.cost}</span></div>
                              <div>⚡ 节省时间: <span className="font-semibold text-blue-600">{stats?.estimatedSavings?.time}</span></div>
                            </div>
                          </Table.Summary.Cell>
                        </Table.Summary.Row>
                      </Table.Summary>
                    )}
                  />
                </Card>
              </motion.div>
            </Col>
          </Row>
        </>
      )}

      {/* 经典视图 - 图表趋势分析 */}
      {viewMode === 'classic' && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* 趋势图 */}
        <Col xs={24} lg={16}>
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8 }}
          >
            <Card 
              title={<span style={{ fontSize: 16, fontWeight: 600 }}>📈 缓存命中趋势</span>}
              style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
              extra={renderChartStyleSwitcher()}
            >
              {renderTrendChart()}
            </Card>
          </motion.div>
        </Col>

        {/* 饼图 - 重新设计为半环形图 */}
        <Col xs={24} lg={8}>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.9 }}
          >
            <Card 
              title={<span style={{ fontSize: 16, fontWeight: 600 }}>🎯 命中率分析</span>}
              style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', height: '100%' }}
              styles={{ body: { padding: '0 24px 24px' } }}
            >
              <div className="relative" style={{ height: 270 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="80%"
                      startAngle={180}
                      endAngle={0}
                      innerRadius={85}
                      outerRadius={115}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.color} 
                          stroke="none"
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
                
                {/* 中心文本 */}
                <div className="absolute inset-0 flex flex-col items-center justify-end pb-8">
                  <span className="text-4xl font-bold" style={{ color: getStatusColor(stats?.hitRate || 0) }}>
                    {stats?.hitRate.toFixed(1)}%
                  </span>
                  <span className="text-gray-500 text-sm font-medium">综合命中率</span>
                </div>
              </div>

              {/* 底部指标说明 */}
              <div className="flex justify-around items-center pt-2 border-t border-gray-100">
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">{stats?.cacheHits || 0}</div>
                  <div className="text-xs text-gray-400">命中次数</div>
                </div>
                <div className="w-px h-8 bg-gray-100" />
                <div className="text-center">
                  <div className="text-lg font-bold text-red-500">{stats?.cacheMisses || 0}</div>
                  <div className="text-xs text-gray-400">未命中</div>
                </div>
                <div className="w-px h-8 bg-gray-100" />
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-500">{stats?.totalRequests || 0}</div>
                  <div className="text-xs text-gray-400">总请求</div>
                </div>
              </div>
            </Card>
          </motion.div>
        </Col>
      </Row>
      )}

      {/* 详细视图 - 完整数据展示 */}
      {viewMode === 'detailed' && (
        <>
          {/* 图表区域 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {/* 趋势图 */}
            <Col xs={24} lg={16}>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
              >
                <Card 
                  title={<span style={{ fontSize: 16, fontWeight: 600 }}>📈 缓存命中趋势</span>}
                  style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                  extra={renderChartStyleSwitcher()}
                >
                  {renderTrendChart()}
                </Card>
              </motion.div>
            </Col>

            {/* 饼图 - 重新设计为半环形图 */}
            <Col xs={24} lg={8}>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 }}
              >
                <Card 
                  title={<span style={{ fontSize: 16, fontWeight: 600 }}>🎯 命中率分析</span>}
                  style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', height: '100%' }}
                  styles={{ body: { padding: '0 24px 24px' } }}
                >
                  <div className="relative" style={{ height: 270 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="80%"
                          startAngle={180}
                          endAngle={0}
                          innerRadius={85}
                          outerRadius={115}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.color} 
                              stroke="none"
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    
                    {/* 中心文本 */}
                    <div className="absolute inset-0 flex flex-col items-center justify-end pb-8">
                      <span className="text-4xl font-bold" style={{ color: getStatusColor(stats?.hitRate || 0) }}>
                        {stats?.hitRate.toFixed(1)}%
                      </span>
                      <span className="text-gray-500 text-sm font-medium">综合命中率</span>
                    </div>
                  </div>

                  {/* 底部指标说明 */}
                  <div className="flex justify-around items-center pt-2 border-t border-gray-100">
                    <div className="text-center">
                      <div className="text-lg font-bold text-green-600">{stats?.cacheHits || 0}</div>
                      <div className="text-xs text-gray-400">命中次数</div>
                    </div>
                    <div className="w-px h-8 bg-gray-100" />
                    <div className="text-center">
                      <div className="text-lg font-bold text-red-500">{stats?.cacheMisses || 0}</div>
                      <div className="text-xs text-gray-400">未命中</div>
                    </div>
                    <div className="w-px h-8 bg-gray-100" />
                    <div className="text-center">
                      <div className="text-lg font-bold text-blue-500">{stats?.totalRequests || 0}</div>
                      <div className="text-xs text-gray-400">总请求</div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </Col>
          </Row>

          {/* 传统详细信息表格 */}
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
              >
                <Card 
                  title={<span style={{ fontSize: 16, fontWeight: 600 }}>📊 详细统计信息</span>}
                  style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                  extra={
                    <div>
                      <span className="text-sm text-gray-500">缓存容量使用率</span>
                      <Progress 
                        percent={((stats?.totalElements || 0) / 10)} 
                        status={
                          (stats?.totalElements || 0) > 900 ? 'exception' : 
                          (stats?.totalElements || 0) > 700 ? 'normal' : 'active'
                        }
                        strokeColor={{
                          '0%': '#108ee9',
                          '100%': '#87d068',
                        }}
                        style={{ width: 200 }}
                      />
                    </div>
                  }
                >
                  <Table
                    size="middle"
                    columns={[
                      { 
                        title: '指标名称', 
                        dataIndex: 'metric', 
                        width: 180,
                        render: (text) => <span className="font-medium">{text}</span>
                      },
                      { 
                        title: '数值', 
                        dataIndex: 'value', 
                        width: 150,
                        render: (text) => <span className="text-blue-600 font-semibold">{text}</span>
                      },
                      { 
                        title: '说明', 
                        dataIndex: 'description',
                        render: (text) => <span className="text-gray-600">{text}</span>
                      }
                    ]}
                    dataSource={[
                      {
                        key: '1',
                        metric: '📝 总请求数',
                        value: `${stats?.totalRequests || 0} 次`,
                        description: '所有缓存请求的总数量（包含元素、操作、断言）'
                      },
                      {
                        key: '2',
                        metric: '✅ 缓存命中',
                        value: `${stats?.cacheHits || 0} 次`,
                        description: '从缓存直接获取，无需调用AI，显著提升速度'
                      },
                      {
                        key: '3',
                        metric: '❌ 缓存未命中',
                        value: `${stats?.cacheMisses || 0} 次`,
                        description: '需要调用AI进行识别，消耗token和时间'
                      },
                      {
                        key: '4',
                        metric: '🔍 元素缓存请求',
                        value: `${stats?.breakdown?.element.requests || 0} 次 (命中率: ${formatHitRate(stats?.breakdown?.element.hitRate)}%)`,
                        description: '页面元素定位识别请求'
                      },
                      {
                        key: '5',
                        metric: '⚡ 操作缓存请求',
                        value: `${stats?.breakdown?.operation.requests || 0} 次 (命中率: ${formatHitRate(stats?.breakdown?.operation.hitRate)}%)`,
                        description: '测试操作步骤解析请求'
                      },
                      {
                        key: '6',
                        metric: '✓ 断言缓存请求',
                        value: `${stats?.breakdown?.assertion.requests || 0} 次 (命中率: ${formatHitRate(stats?.breakdown?.assertion.hitRate)}%)`,
                        description: '断言验证逻辑解析请求'
                      },
                      {
                        key: '7',
                        metric: '💾 内存占用',
                        value: `${stats?.memoryUsage || 0} KB`,
                        description: '当前缓存占用的内存大小'
                      },
                      {
                        key: '8',
                        metric: '📦 缓存元素数',
                        value: `${stats?.totalElements || 0} / 1000`,
                        description: '已缓存的元素数量及容量上限'
                      },
                      {
                        key: '9',
                        metric: '💰 节省成本',
                        value: stats?.estimatedSavings?.cost || '0 元',
                        description: '根据token使用量估算的节省费用'
                      },
                      {
                        key: '10',
                        metric: '⚡ 节省时间',
                        value: stats?.estimatedSavings?.time || '0ms',
                        description: '缓存避免API调用节省的累计时间'
                      }
                    ]}
                    pagination={false}
                    bordered
                  />
                </Card>
              </motion.div>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
};

export default CacheStatsPage;

