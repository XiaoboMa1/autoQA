import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, Table, Tag, Empty, Spin, Select, Button } from 'antd';
import { Line, Pie } from '@ant-design/charts';
import {
  BugIcon,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Download,
  RefreshCw
} from 'lucide-react';
import { reportService, BugStats, TrendDataPoint, FailureReason, FlakyTest, FailedCase, SuiteSummary } from '../services/reportService';
import { format, subDays } from 'date-fns';
import type { ColumnsType } from 'antd/es/table';

const { Option } = Select;

// 快捷日期选项
const quickDateRanges = {
  '今天': [new Date(), new Date()],
  '昨天': [subDays(new Date(), 1), subDays(new Date(), 1)],
  '最近7天': [subDays(new Date(), 6), new Date()],
  '最近30天': [subDays(new Date(), 29), new Date()],
  '本月': [new Date(new Date().getFullYear(), new Date().getMonth(), 1), new Date()],
};

export function TestReports() {
  // 筛选条件状态
  const [dateRange, setDateRange] = useState<[Date, Date]>(quickDateRanges['今天'] as [Date, Date]);
  const [project, setProject] = useState<string>('all');
  const [suiteId, setSuiteId] = useState<string>('all');
  
  // 套件和项目列表
  const [suites, setSuites] = useState<Array<{ id: number; name: string }>>([]);
  const [projects, setProjects] = useState<Array<string>>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // 数据状态
  const [loading, setLoading] = useState(true);
  const [bugStats, setBugStats] = useState<BugStats | null>(null);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [failureReasons, setFailureReasons] = useState<FailureReason[]>([]);
  const [flakyTests, setFlakyTests] = useState<FlakyTest[]>([]);
  const [failedCases, setFailedCases] = useState<FailedCase[]>([]);
  const [failedCasesTotal, setFailedCasesTotal] = useState(0);
  const [failedCasesPage, setFailedCasesPage] = useState(1);
  const [suiteSummary, setSuiteSummary] = useState<SuiteSummary[]>([]);
  
  // 加载套件和项目列表
  const loadOptions = async () => {
    try {
      setLoadingOptions(true);
      const { getApiBaseUrl } = await import('../config/api');
      const apiBaseUrl = getApiBaseUrl('/api');
      
      // 并行获取套件列表和项目列表（从项目管理获取）
      const [suitesResponse, projectsResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/suites`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
          }
        }),
        reportService.getProjects().catch((err) => {
          console.warn('从报告API获取项目列表失败，尝试从系统管理API获取:', err);
          // 降级方案：从系统管理API获取
          return fetch(`${apiBaseUrl}/v1/systems/active`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
            }
          }).then(res => res.json())
            .then(data => Array.isArray(data) ? data.map((sys: { name: string }) => sys.name) : [])
            .catch(() => []);
        })
      ]);
      
      const suitesData = await suitesResponse.json();
      
      if (suitesData.success) {
        setSuites(suitesData.data.map((suite: { id: number; name: string }) => ({ 
          id: suite.id, 
          name: suite.name 
        })));
      }
      
      // 设置项目列表（从项目管理 systems 表获取）
      if (Array.isArray(projectsResponse) && projectsResponse.length > 0) {
        setProjects(projectsResponse);
      }
    } catch (error) {
      console.error('加载套件和项目列表失败:', error);
    } finally {
      setLoadingOptions(false);
    }
  };
  
  useEffect(() => {
    loadOptions();
  }, []);

  // 加载数据
  const loadReportData = async () => {
    try {
      setLoading(true);
      const params = {
        startDate: format(dateRange[0], 'yyyy-MM-dd'),
        endDate: format(dateRange[1], 'yyyy-MM-dd'),
        project: project !== 'all' ? project : undefined,
        suiteId: suiteId !== 'all' ? suiteId : undefined,
      };

      console.log('🔄 加载报告数据...', params);

      // 并行加载所有数据
      const [stats, trend, reasons, flaky, failed, suites] = await Promise.all([
        reportService.getBugStats(params),
        reportService.getBugTrend(params),
        reportService.getFailureReasons(params),
        reportService.getFlakyTests({ ...params, limit: 10 }),
        reportService.getFailedCases({ ...params, page: 1, pageSize: 10 }),
        reportService.getSuiteSummary(params),
      ]);

      setBugStats(stats);
      setTrendData(trend);
      setFailureReasons(reasons);
      setFlakyTests(flaky);
      setFailedCases(failed.records);
      setFailedCasesTotal(failed.total);
      setSuiteSummary(suites);

      console.log('✅ 报告数据加载完成');
    } catch (error) {
      console.error('❌ 加载报告数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReportData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, project, suiteId]);

  // KPI卡片数据
  const kpiCards = bugStats ? [
    {
      title: 'BUG总数',
      value: bugStats.totalBugs,
      change: bugStats.trend.bugsChange,
      icon: BugIcon,
      color: 'red',
      bgColor: 'bg-red-100',
      iconColor: 'text-red-600'
    },
    {
      title: '通过用例',
      value: bugStats.passedCases,
      change: bugStats.trend.passedChange,
      icon: CheckCircle,
      color: 'green',
      bgColor: 'bg-green-100',
      iconColor: 'text-green-600'
    },
    {
      title: '成功率',
      value: `${bugStats.successRate}%`,
      change: bugStats.trend.successRateChange,
      icon: TrendingUp,
      color: 'blue',
      bgColor: 'bg-blue-100',
      iconColor: 'text-blue-600'
    },
    {
      title: '平均时长',
      value: `${bugStats.avgDuration}分钟`,
      change: bugStats.trend.durationChange,
      icon: Clock,
      color: 'orange',
      bgColor: 'bg-orange-100',
      iconColor: 'text-orange-600'
    },
  ] : [];

  // BUG趋势图配置
  const trendChartConfig = {
    data: trendData,
    xField: 'date',
    yField: 'bugCount',
    smooth: true,
    color: '#ef4444',
    lineStyle: {
      lineWidth: 3,
    },
    point: {
      size: 5,
      shape: 'circle',
      style: {
        fill: '#ef4444',
        stroke: '#fff',
        lineWidth: 2,
      },
    },
    tooltip: {
      formatter: (datum: any) => {
        return {
          name: 'BUG数量',
          value: `${datum.bugCount}个 (共${datum.caseCount}个用例)`
        };
      }
    },
    yAxis: {
      label: {
        formatter: (v: string) => `${v}个`
      }
    }
  };

  // 失败原因饼图配置
  const failureReasonChartConfig = {
    data: failureReasons,
    angleField: 'percentage',
    colorField: 'categoryName',
    radius: 0.8,
    innerRadius: 0.6,
    label: {
      type: 'outer',
      content: '{name} {percentage}%',
    },
    interactions: [
      {
        type: 'element-active',
      },
    ],
    statistic: {
      title: {
        content: '失败原因',
      },
      content: {
        content: `${failureReasons.reduce((sum, r) => sum + r.count, 0)}个`,
      },
    },
    color: ['#ef4444', '#f59e0b', '#f97316', '#94a3b8'],
  };

  // 不稳定用例表格列
  const flakyTestColumns: ColumnsType<FlakyTest> = [
    {
      title: '#',
      width: 60,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: '用例名称',
      dataIndex: 'caseName',
      key: 'caseName',
      render: (text: string, record: FlakyTest) => (
        <div>
          <div className="font-medium text-gray-900">{text}</div>
          <div className="text-sm text-gray-500">所属套件: {record.suiteName}</div>
        </div>
      ),
    },
    {
      title: '失败率',
      dataIndex: 'failureRate',
      key: 'failureRate',
      width: 120,
      render: (rate: number, record: FlakyTest) => (
        <div className="flex items-center space-x-2">
          <div className="text-lg font-bold">{rate}%</div>
          <Tag color={record.severity === 'high' ? 'red' : record.severity === 'medium' ? 'orange' : 'default'}>
            {record.severity === 'high' ? '高' : record.severity === 'medium' ? '中' : '低'}
          </Tag>
        </div>
      ),
    },
    {
      title: '失败次数',
      dataIndex: 'failures',
      key: 'failures',
      width: 100,
      render: (failures: number) => (
        <span className="text-red-600 font-semibold">{failures}</span>
      ),
    },
    {
      title: '总次数',
      dataIndex: 'totalRuns',
      key: 'totalRuns',
      width: 100,
    },
    {
      title: '最后失败',
      dataIndex: 'lastFailure',
      key: 'lastFailure',
      width: 150,
      render: (date: string | null) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
  ];

  // 失败用例表格列
  const failedCaseColumns: ColumnsType<FailedCase> = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 150,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '用例名称',
      dataIndex: 'caseName',
      key: 'caseName',
      render: (text: string, record: FailedCase) => (
        <div>
          <div className="font-medium text-gray-900">{text}</div>
          <div className="text-sm text-gray-500">{record.suiteName}</div>
        </div>
      ),
    },
    {
      title: '失败原因',
      dataIndex: 'errorCategory',
      key: 'errorCategory',
      width: 120,
      render: (category: string) => (
        <Tag color="red">{category}</Tag>
      ),
    },
    {
      title: '执行人',
      dataIndex: 'executor',
      key: 'executor',
      width: 150,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: FailedCase) => (
        <div className="flex space-x-2">
          {record.screenshotUrl && (
            <a href={record.screenshotUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
              查看截图
            </a>
          )}
          {record.hasLogs && (
            <span className="text-blue-600 cursor-pointer hover:underline text-sm">
              查看日志
            </span>
          )}
        </div>
      ),
    },
  ];

  // 套件统计表格列
  const suiteSummaryColumns: ColumnsType<SuiteSummary> = [
    {
      title: '套件名称',
      dataIndex: 'suiteName',
      key: 'suiteName',
    },
    {
      title: '执行次数',
      dataIndex: 'executions',
      key: 'executions',
      width: 100,
    },
    {
      title: '成功率',
      dataIndex: 'successRate',
      key: 'successRate',
      width: 100,
      render: (rate: number) => (
        <span className={rate >= 95 ? 'text-green-600' : rate >= 90 ? 'text-orange-600' : 'text-red-600'}>
          {rate}%
        </span>
      ),
    },
    {
      title: 'BUG数',
      dataIndex: 'bugCount',
      key: 'bugCount',
      width: 100,
      render: (count: number) => (
        <span className="text-red-600 font-semibold">{count}</span>
      ),
    },
    {
      title: '平均时长',
      dataIndex: 'avgDuration',
      key: 'avgDuration',
      width: 120,
      render: (duration: number) => `${duration}分钟`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">测试报告</h1>
          <p className="mt-1 text-sm sm:text-base text-gray-600">
            BUG统计分析 · 最后更新: {new Date().toLocaleTimeString('zh-CN')}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={loadReportData}
            loading={loading}
          >
            刷新
          </Button>
          <Button
            type="primary"
            icon={<Download className="h-4 w-4" />}
          >
            导出报告
          </Button>
        </div>
      </motion.div>

      {/* 筛选栏 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-lg shadow p-4"
      >
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">时间范围</label>
            <div className="flex items-center space-x-2">
              {Object.entries(quickDateRanges).map(([label, range]) => (
                <button
                  key={label}
                  onClick={() => setDateRange(range as [Date, Date])}
                  className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                    dateRange[0].toDateString() === range[0].toDateString()
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">所属项目</label>
            <Select
              value={project}
              onChange={setProject}
              className="w-full"
              loading={loadingOptions}
            >
              <Option value="all">全部项目</Option>
              {projects.map(proj => (
                <Option key={proj} value={proj}>
                  {proj}
                </Option>
              ))}
            </Select>
          </div>
          <div className="min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">所属计划</label>
            <Select
              value={suiteId}
              onChange={setSuiteId}
              className="w-full"
              loading={loadingOptions}
            >
              <Option value="all">全部套件</Option>
              {suites.map(suite => (
                <Option key={suite.id} value={suite.id.toString()}>
                  {suite.name}
                </Option>
              ))}
            </Select>
          </div>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-64">
          <Spin size="large" />
          <div className="mt-4 text-gray-500">加载中...</div>
        </div>
      ) : (
        <>
          {/* KPI卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {kpiCards.map((kpi, index) => (
              <motion.div
                key={kpi.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + index * 0.1 }}
              >
                <Card className="shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">{kpi.title}</p>
                      <p className="text-3xl font-bold text-gray-900 mt-1">{kpi.value}</p>
                      <div className="flex items-center mt-2">
                        {typeof kpi.change === 'number' && kpi.change !== 0 && (
                          <>
                            {kpi.change > 0 ? (
                              <TrendingUp className="h-4 w-4 text-red-600 mr-1" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-green-600 mr-1" />
                            )}
                            <span className={`text-sm ${kpi.change > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {kpi.change > 0 ? '+' : ''}{kpi.change} 较上周期
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className={`h-12 w-12 ${kpi.bgColor} rounded-lg flex items-center justify-center`}>
                      <kpi.icon className={`h-6 w-6 ${kpi.iconColor}`} />
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* BUG趋势 + 失败原因 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <Card title="📈 BUG趋势分析" className="shadow-sm">
                {trendData.length > 0 ? (
                  <Line {...trendChartConfig} height={300} />
                ) : (
                  <Empty description="暂无趋势数据" />
                )}
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
            >
              <Card title="🔍 失败原因分布" className="shadow-sm">
                {failureReasons.length > 0 ? (
                  <Pie {...failureReasonChartConfig} height={300} />
                ) : (
                  <Empty description="暂无失败原因数据" />
                )}
              </Card>
            </motion.div>
          </div>

          {/* 不稳定用例 Top 10 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
          >
            <Card
              title={
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <span>🎯 最不稳定用例 Top 10</span>
                </div>
              }
              className="shadow-sm"
            >
              <Table
                columns={flakyTestColumns}
                dataSource={flakyTests}
                rowKey="caseId"
                pagination={false}
                size="middle"
              />
              {flakyTests.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-800">
                    💡 <span className="font-medium">建议:</span> 失败率超过30%的用例需要优先修复
                  </p>
                </div>
              )}
            </Card>
          </motion.div>

          {/* 失败用例详细列表 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
          >
            <Card
              title={`🐛 失败用例详细列表 (共${failedCasesTotal}个)`}
              className="shadow-sm"
            >
              <Table
                columns={failedCaseColumns}
                dataSource={failedCases}
                rowKey="id"
                pagination={{
                  current: failedCasesPage,
                  pageSize: 10,
                  total: failedCasesTotal,
                  onChange: (page) => setFailedCasesPage(page),
                  showTotal: (total) => `共 ${total} 条记录`,
                }}
                size="middle"
              />
            </Card>
          </motion.div>

          {/* 套件统计 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0 }}
          >
            <Card title="📦 测试套件统计" className="shadow-sm">
              <Table
                columns={suiteSummaryColumns}
                dataSource={suiteSummary}
                rowKey="suiteId"
                pagination={false}
                size="middle"
              />
            </Card>
          </motion.div>
        </>
      )}
    </div>
  );
}
