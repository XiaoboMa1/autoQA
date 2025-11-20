import React, { useEffect, useState } from 'react';
import { Button } from './ui/button';

interface QueueTask {
  id: string;
  userId: string;
  type: 'test' | 'suite';
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
}

interface QueueStatus {
  global: {
    size: number;
    pending: number;
    concurrency: number;
  };
  waiting: QueueTask[];
  active: QueueTask[];
  estimatedWaitTime: number;
}

export const QueueStatus: React.FC = () => {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchQueueStatus();
    
    // 每5秒自动刷新
    const interval = setInterval(fetchQueueStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchQueueStatus = async () => {
    try {
      setRefreshing(true);
      const response = await fetch('/api/queue/status');
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.data);
      }
    } catch (error) {
      console.error('获取队列状态失败:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    try {
      const response = await fetch(`/api/queue/cancel/${taskId}`, {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        // 刷新状态
        fetchQueueStatus();
      }
    } catch (error) {
      console.error('取消任务失败:', error);
    }
  };

  const formatWaitTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}秒`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
    return `${Math.floor(seconds / 3600)}小时`;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-100';
      case 'low': return 'text-green-600 bg-green-100';
      default: return 'text-yellow-600 bg-yellow-100';
    }
  };

  // ⏱️ 等待时长工具
  const secondsSince = (iso: string) =>
    Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));

  const formatShort = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  };

  if (loading) {
    return (
      <div className="queue-status p-4">
        <div className="flex items-center justify-center h-32">
          <div className="text-gray-500">加载队列状态中...</div>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="queue-status p-4">
        <div className="text-center text-red-500">
          无法获取队列状态
        </div>
      </div>
    );
  }

  // 预计算并发使用率与最大等待时长
  const used = Math.min(status.global.pending / Math.max(1, status.global.concurrency), 1);
  const usedPercent = Math.round(used * 100);
  const usedColor = used < 0.6 ? 'bg-green-500' : used < 0.85 ? 'bg-yellow-500' : 'bg-red-500';
  const maxWaitSec = Math.max(1, ...status.waiting.map(t => secondsSince(t.createdAt)));

  return (
    <div className="queue-status p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">队列状态</h3>
        <Button onClick={fetchQueueStatus} disabled={refreshing} size="sm">
          {refreshing ? '刷新中...' : '刷新'}
        </Button>
      </div>

      {/* 全局统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 p-3 rounded-lg">
          <div className="text-sm text-blue-600">队列大小</div>
          <div className="text-xl font-bold text-blue-800">{status.global.size}</div>
        </div>
        <div className="bg-green-50 p-3 rounded-lg">
          <div className="text-sm text-green-600">执行中</div>
          <div className="text-xl font-bold text-green-800">{status.global.pending}</div>
        </div>
        <div className="bg-purple-50 p-3 rounded-lg">
          <div className="text-sm text-purple-600">并发数</div>
          <div className="text-xl font-bold text-purple-800">{status.global.concurrency}</div>
        </div>
        <div className="bg-orange-50 p-3 rounded-lg">
          <div className="text-sm text-orange-600">预计等待</div>
          <div className="text-xl font-bold text-orange-800">
            {formatWaitTime(status.estimatedWaitTime)}
          </div>
        </div>
      </div>

      {/* 资源占用与压力 */}
      <div className="mb-6">
        <div className="bg-white border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-700">并发使用率</div>
            <div className="text-sm text-gray-700">
              {status.global.pending}/{status.global.concurrency} ({usedPercent}%)
            </div>
          </div>
          <div className="h-2 bg-gray-200 rounded">
            <div className={`h-2 rounded ${usedColor}`} style={{ width: `${usedPercent}%` }}></div>
          </div>
        </div>
      </div>

      {/* 活动任务 */}
      <div className="mb-6">
        <h4 className="text-md font-semibold mb-3">正在执行 ({status.active.length})</h4>
        {status.active.length === 0 ? (
          <div className="text-gray-500 text-center py-4">暂无执行中的任务</div>
        ) : (
          <div className="space-y-2">
            {status.active.map((task) => (
              <div key={task.id} className="border rounded-lg p-3 bg-green-50">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{task.id}</span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(task.priority)}`}>
                        {task.priority}
                      </span>
                      <span className="text-xs text-gray-600">{task.type}</span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      用户: {task.userId} | 开始时间: {new Date(task.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-green-600">执行中</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 等待任务 */}
      <div>
        <h4 className="text-md font-semibold mb-3">等待队列 ({status.waiting.length})</h4>
        {status.waiting.length === 0 ? (
          <div className="text-gray-500 text-center py-4">暂无等待中的任务</div>
        ) : (
          <div className="space-y-2">
            {status.waiting.map((task, index) => {
              const waitSec = secondsSince(task.createdAt);
              const percent = Math.max(0, Math.min(100, Math.round((waitSec / maxWaitSec) * 100)));
              const barColor = percent < 40 ? 'bg-green-500' : percent < 70 ? 'bg-yellow-500' : 'bg-red-500';
              const isAlert = (task.priority === 'high' && waitSec > 60) || waitSec > 300;
              return (
                <div key={task.id} className={`border rounded-lg p-3 ${isAlert ? 'border-red-300 bg-red-50/50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">#{index + 1}</span>
                        <span className="font-medium">{task.id}</span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(task.priority)}`}>
                          {task.priority}
                        </span>
                        <span className="text-xs text-gray-600">{task.type}</span>
                        <span className="text-sm text-gray-700">等待: {formatShort(waitSec)}</span>
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        用户: {task.userId} | 创建时间: {new Date(task.createdAt).toLocaleString()}
                      </div>
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-sm text-gray-700 mb-1">
                          <span>等待时长</span>
                          <span>{percent}%</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded">
                          <div className={`h-2 rounded ${barColor}`} style={{ width: `${percent}%` }}></div>
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleCancelTask(task.id)}
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700"
                    >
                      取消
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};