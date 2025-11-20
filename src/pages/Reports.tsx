import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Download,
  Calendar,
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  Image as ImageIcon
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';
import { format, subDays } from 'date-fns';
import { reportService, BugStats, TrendDataPoint, FailureReason, FlakyTest, FailedCase, SuiteSummary } from '../services/reportService';
import { DatePicker, Select, message, Spin, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';

const { RangePicker } = DatePicker;
const { Option } = Select;

export function Reports() {
  // 状态管理
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[Date, Date]>([subDays(new Date(), 30), new Date()]);
  const [department, setDepartment] = useState<string>('all');
  const [suiteId, setSuiteId] = useState<string | number>('all');

  // 数据状态
  const [bugStats, setBugStats] = useState<BugStats | null>(null);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [failureReasons, setFailureReasons] = useState<FailureReason[]>([]);
  const [flakyTests, setFlakyTests] = useState<FlakyTest[]>([]);
  const [failedCases, setFailedCases] = useState<FailedCase[]>([]);
  const [suiteSummaries, setSuiteSummaries] = useState<SuiteSummary[]>([]);

  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalFailedCases, setTotalFailedCases] = useState(0);

  // 加载数据
  const fetchReportData = async () => {
    if (!dateRange || dateRange.length !== 2) {
      message.warning('请选择日期范围');
      return;
    }

    setLoading(true);
    try {
      const params = {
        startDate: format(dateRange[0], 'yyyy-MM-dd'),
        endDate: format(dateRange[1], 'yyyy-MM-dd'),
        department: department !== 'all' ? department : undefined,
        suiteId: suiteId !== 'all' ? suiteId : undefined,
      };

      // 并行加载所有数据
      const [
        statsData,
        trendDataRes,
        failureReasonsRes,
        flakyTestsRes,
        failedCasesRes,
        suiteSummariesRes
      ] = await Promise.all([
        reportService.getBugStats(params),
        reportService.getBugTrend(params),
        reportService.getFailureReasons(params),
        reportService.getFlakyTests({ ...params, limit: 10 }),
        reportService.getFailedCases({ ...params, page: currentPage, pageSize }),
        reportService.getSuiteSummary({ ...params })
      ]);

      setBugStats(statsData);
      setTrendData(trendDataRes);
      setFailureReasons(failureReasonsRes);
      setFlakyTests(flakyTestsRes);
      setFailedCases(failedCasesRes.records);
      setTotalFailedCases(failedCasesRes.total);
      setSuiteSummaries(suiteSummariesRes);

      message.success('报告数据加载成功');
    } catch (error: any) {
      console.error('加载报告数据失败:', error);
      message.error('加载报告数据失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  // 初始加载和参数变化时重新加载
  useEffect(() => {
    fetchReportData();
  }, [dateRange, department, suiteId, currentPage, pageSize]);

  // 失败用例表格列定义
  const failedCaseColumns: ColumnsType<FailedCase> = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (timestamp: string) => format(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss')
    },
    {
      title: '用例名称',
      dataIndex: 'caseName',
      key: 'caseName',
      width: 200
    },
    {
      title: '测试套件',
      dataIndex: 'suiteName',
      key: 'suiteName',
      width: 150
    },
    {
      title: '执行人',
      dataIndex: 'executor',
      key: 'executor',
      width: 120
    },
    {
      title: '失败类型',
      dataIndex: 'errorCategory',
      key: 'errorCategory',
      width: 120,
      render: (category: string) => {
        const colorMap: Record<string, string> = {
          '断言失败': 'red',
          '超时': 'orange',
          '元素未找到': 'blue',
          '其他': 'default'
        };
        return <Tag color={colorMap[category] || 'default'}>{category}</Tag>;
      }
    },
    {
      title: '失败原因',
      dataIndex: 'failureReason',
      key: 'failureReason',
      ellipsis: true,
      width: 300
    },
    {
      title: '附件',
      key: 'attachments',
      width: 100,
      render: (_: any, record: FailedCase) => (
        <div className="flex space-x-2">
          {record.screenshotUrl && (
            <ImageIcon className="h-4 w-4 text-blue-500 cursor-pointer" title="有截图" />
          )}
          {record.hasLogs && (
            <FileText className="h-4 w-4 text-green-500 cursor-pointer" title="有日志" />
          )}
        </div>
      )
    }
  ];

  // 不稳定用例表格列
  const flakyTestColumns: ColumnsType<FlakyTest> = [
    {
      title: '用例名称',
      dataIndex: 'caseName',
      key: 'caseName'
    },
    {
      title: '测试套件',
      dataIndex: 'suiteName',
      key: 'suiteName'
    },
    {
      title: '总执行次数',
      dataIndex: 'totalRuns',
      key: 'totalRuns',
      align: 'center'
    },
    {
      title: '失败次数',
      dataIndex: 'failures',
      key: 'failures',
      align: 'center'
    },
    {
      title: '失败率',
      dataIndex: 'failureRate',
      key: 'failureRate',
      align: 'center',
      render: (rate: number, record: FlakyTest) => {
        const color = record.severity === 'high' ? 'red' : record.severity === 'medium' ? 'orange' : 'yellow';
        return <Tag color={color}>{rate.toFixed(1)}%</Tag>;
      }
    },
    {
      title: '最后失败时间',
      dataIndex: 'lastFailure',
      key: 'lastFailure',
      render: (date: string | null) => date ? format(new Date(date), 'yyyy-MM-dd HH:mm') : '-'
    }
  ];

  // 失败原因饼图颜色
  const FAILURE_COLORS = ['#EF4444', '#F97316', '#3B82F6', '#6B7280'];

  return (
    <div className="space-y-6">
      {/* Header with Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">测试报告</h2>
          <p className="text-gray-600 dark:text-gray-600">分析测试执行趋势和性能指标</p>
        </div>
        <div className="flex items-center space-x-3 flex-wrap">
          <RangePicker
            value={[dateRange[0] as any, dateRange[1] as any]}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setDateRange([dates[0].toDate(), dates[1].toDate()]);
              }
            }}
            format="YYYY-MM-DD"
            className="w-64"
          />
          <Select
            value={department}
            onChange={setDepartment}
            className="w-32"
          >
            <Option value="all">所有部门</Option>
            <Option value="研发部">研发部</Option>
            <Option value="测试部">测试部</Option>
            <Option value="产品部">产品部</Option>
          </Select>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={fetchReportData}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Download className="h-5 w-5 mr-2" />
            刷新数据
          </motion.button>
        </div>
      </div>

      <Spin spinning={loading}>
        {/* Key Metrics */}
        {bugStats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-600">BUG总数</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{bugStats.totalBugs}</p>
                  <p className={`text-sm flex items-center mt-1 ${bugStats.trend.bugsChange > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {bugStats.trend.bugsChange > 0 ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />}
                    {bugStats.trend.bugsChange > 0 ? '+' : ''}{bugStats.trend.bugsChange} 较上期
                  </p>
                </div>
                <div className="h-12 w-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                  <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-600">通过用例</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{bugStats.passedCases}</p>
                  <p className={`text-sm flex items-center mt-1 ${bugStats.trend.passedChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {bugStats.trend.passedChange > 0 ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />}
                    {bugStats.trend.passedChange > 0 ? '+' : ''}{bugStats.trend.passedChange} 较上期
                  </p>
                </div>
                <div className="h-12 w-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-600">成功率</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{bugStats.successRate}%</p>
                  <p className={`text-sm flex items-center mt-1 ${bugStats.trend.successRateChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {bugStats.trend.successRateChange > 0 ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />}
                    {bugStats.trend.successRateChange > 0 ? '+' : ''}{bugStats.trend.successRateChange}% 较上期
                  </p>
                </div>
                <div className="h-12 w-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <Activity className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-600">平均执行时长</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{bugStats.avgDuration.toFixed(1)}分</p>
                  <p className={`text-sm flex items-center mt-1 ${bugStats.trend.durationChange < 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {bugStats.trend.durationChange < 0 ? <TrendingDown className="h-4 w-4 mr-1" /> : <TrendingUp className="h-4 w-4 mr-1" />}
                    {bugStats.trend.durationChange > 0 ? '+' : ''}{bugStats.trend.durationChange.toFixed(1)}分 较上期
                  </p>
                </div>
                <div className="h-12 w-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                  <Clock className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bug Trend */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">BUG趋势分析</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="bugCount" stroke="#EF4444" name="BUG数" strokeWidth={2} />
                <Line type="monotone" dataKey="caseCount" stroke="#3B82F6" name="用例数" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Failure Reasons Distribution */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">失败原因分布</h3>
            {failureReasons.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <RechartsPieChart>
                    <Pie
                      data={failureReasons}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="count"
                    >
                      {failureReasons.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={FAILURE_COLORS[index % FAILURE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="mt-4 space-y-2">
                  {failureReasons.map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div
                          className="h-3 w-3 rounded-full mr-2"
                          style={{ backgroundColor: FAILURE_COLORS[index % FAILURE_COLORS.length] }}
                        ></div>
                        <span className="text-sm text-gray-600 dark:text-gray-600">{item.categoryName}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.percentage}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-600">暂无数据</div>
            )}
          </motion.div>
        </div>

        {/* Flaky Tests Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">不稳定用例 Top 10</h3>
            </div>
          </div>
          <Table
            columns={flakyTestColumns}
            dataSource={flakyTests}
            rowKey="caseId"
            pagination={false}
            size="small"
            locale={{ emptyText: '暂无不稳定用例' }}
          />
        </motion.div>

        {/* Failed Cases Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">失败用例详情</h3>
          <Table
            columns={failedCaseColumns}
            dataSource={failedCases}
            rowKey="id"
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: totalFailedCases,
              onChange: (page, size) => {
                setCurrentPage(page);
                setPageSize(size || 10);
              },
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`
            }}
            size="small"
            locale={{ emptyText: '暂无失败用例' }}
            scroll={{ x: 1200 }}
          />
        </motion.div>

        {/* Suite Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">套件统计</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={suiteSummaries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="suiteName" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip />
              <Legend />
              <Bar dataKey="executions" fill="#3B82F6" name="执行次数" />
              <Bar dataKey="bugCount" fill="#EF4444" name="BUG数" />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </Spin>
    </div>
  );
}
