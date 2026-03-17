import React, { useState, useEffect } from 'react';
import { Row, Col, Segmented, Button, Space, Spin } from 'antd';
import { motion } from 'framer-motion';
import {
  PlayCircleOutlined,
  ClockCircleOutlined,
  TrophyOutlined,
  BugOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { StatCard } from '../components/dashboard/StatCard';
import { ChartCard } from '../components/dashboard/ChartCard';
import { RecentActivityCard } from '../components/dashboard/RecentActivityCard';
import { FailureHeatmap } from '../components/dashboard/FailureHeatmap';
import { DurationDistribution } from '../components/dashboard/DurationDistribution';
import { FlakyTestsRanking } from '../components/dashboard/FlakyTestsRanking';
import { dashboardService } from '../services/dashboardService';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import type { DashboardStats, TrendData, RecentActivity } from '../services/dashboardService';

// 统一卡片底板（不侵入子组件）
const CardShell: React.FC<React.PropsWithChildren<{ hover?: boolean }>> = ({ children, hover = true }) => (
  <motion.div
    className="rounded-2xl border border-slate-200/80 bg-white/75 backdrop-blur-sm shadow-sm overflow-hidden"
    whileHover={hover ? { y: -6, boxShadow: '0 12px 30px rgba(15,23,42,0.08)' } : undefined}
    transition={{ duration: 0.2 }}
  >
    <div className="p-4 sm:p-5 lg:p-6">{children}</div>
  </motion.div>
);

export function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7' | '14' | '30'>('7');

  // 数据状态
  const [stats, setStats] = useState<DashboardStats>({
    successRate: 0,
    todayExecutions: 0,
    averageDuration: 0,
    weeklyFailures: 0,
  });
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [durationData, setDurationData] = useState<any[]>([]);
  const [flakyTestsData, setFlakyTestsData] = useState<any[]>([]);

  // 加载Dashboard数据
  const loadDashboardData = async () => {
    try {
      setLoading(true);
      console.log('🔄 开始加载Dashboard数据...');

      // 并行加载所有数据
      const [statsData, trendResult, activitiesData, heatmap, duration, flakyTests] = await Promise.all([
        dashboardService.getStats(),
        dashboardService.getTrend(parseInt(timeRange)),
        dashboardService.getRecentActivities(5),
        dashboardService.getFailureHeatmap(parseInt(timeRange)),
        dashboardService.getDurationDistribution(),
        dashboardService.getFlakyTests(5),
      ]);

      setStats(statsData);
      setTrendData(trendResult);
      setActivities(activitiesData);
      setHeatmapData(heatmap);
      setDurationData(duration);
      setFlakyTestsData(flakyTests);

      console.log('✅ Dashboard数据加载完成:', {
        stats: statsData,
        trend: trendResult.length,
        activities: activitiesData.length,
        heatmap: heatmap.length,
        duration: duration.length,
        flakyTests: flakyTests.length,
      });
    } catch (error) {
      console.error('❌ Dashboard数据加载失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadDashboardData();
  }, [timeRange]);

  // 刷新数据
  const handleRefresh = () => {
    loadDashboardData();
  };

  // 时间范围切换
  const handleTimeRangeChange = (value: string) => {
    const dayMap: { [key: string]: '7' | '14' | '30' } = {
      '近7天': '7',
      '近14天': '14',
      '近30天': '30',
    };
    setTimeRange(dayMap[value]);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-white p-6">
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <motion.div
      className="min-h-screen overflow-x-hidden bg-gradient-to-b from-slate-50 via-white to-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45 }}
    >
      <div className="w-full">
        {/* 顶部工具条 */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-6 sm:mb-8"
        >
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">工作台</h1>
              <p className="mt-1 text-slate-600">
                实时数据看板 · 最后更新: {new Date().toLocaleTimeString('zh-CN')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Segmented
                options={['近7天', '近14天', '近30天']}
                defaultValue="近7天"
                size="middle"
                onChange={handleTimeRangeChange}
              />
              <Space>
                <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
                  刷新
                </Button>
                <Button type="primary" icon={<PlusOutlined />}>
                  新建测试
                </Button>
              </Space>
            </div>
          </div>
        </motion.div>

        {/* KPI 四宫格 */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <Row gutter={[24, 24]} className="mb-8">
            <Col xs={24} sm={12} lg={6}>
              <CardShell>
                <StatCard
                  icon={<TrophyOutlined />}
                  title="成功率"
                  value={stats.successRate.toFixed(1)}
                  suffix="%"
                  valueStyle={{ color: stats.successRate >= 90 ? '#16a34a' : stats.successRate >= 70 ? '#f59e0b' : '#ef4444' }}
                />
              </CardShell>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <CardShell>
                <StatCard
                  icon={<PlayCircleOutlined />}
                  title="今日执行"
                  value={stats.todayExecutions}
                  suffix="次"
                  valueStyle={{ color: '#1677ff' }}
                />
              </CardShell>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <CardShell>
                <StatCard
                  icon={<ClockCircleOutlined />}
                  title="平均执行时长"
                  value={stats.averageDuration.toFixed(1)}
                  suffix="分钟"
                  valueStyle={{ color: '#f59e0b' }}
                />
              </CardShell>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <CardShell>
                <StatCard
                  icon={<BugOutlined />}
                  title="本周失败"
                  value={stats.weeklyFailures}
                  suffix="个"
                  valueStyle={{ color: '#ef4444' }}
                />
              </CardShell>
            </Col>
          </Row>
        </motion.div>

        {/* 主趋势 + 最近活动 */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Row gutter={[24, 24]} className="mb-8">
            <Col xs={24} lg={16}>
              <CardShell>
                <ChartCard
                  title={`近${timeRange}天成功率趋势`}
                  chartData={trendData}
                  height={380}
                  chartType="area"
                />
              </CardShell>
            </Col>
            <Col xs={24} lg={8}>
              <CardShell>
                <RecentActivityCard title="最近活动" activities={activities} maxItems={5} />
              </CardShell>
            </Col>
          </Row>
        </motion.div>

        {/* 🔥 高级数据分析 */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Row gutter={[24, 24]} className="mb-8">
            <Col xs={24} lg={12}>
              <FailureHeatmap data={heatmapData} />
            </Col>
            <Col xs={24} lg={12}>
              <DurationDistribution data={durationData} />
            </Col>
          </Row>
        </motion.div>

        {/* 🔥 不稳定用例排名 */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Row gutter={[24, 24]} className="mb-8">
            <Col xs={24}>
              <FlakyTestsRanking data={flakyTestsData} maxItems={5} />
            </Col>
          </Row>
        </motion.div>

        {/* 适度留白 */}
        <div className="h-2" />
      </div>
    </motion.div>
  );
}
