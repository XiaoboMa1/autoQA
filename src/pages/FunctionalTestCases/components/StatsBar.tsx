import React from 'react';
import { Bot, User } from 'lucide-react';
import { Tooltip } from 'antd';

export interface StatsData {
    scenarios: number;
    testPoints: number;
    testCases: number;
    aiCount: number;
    manualCount: number;
    avgCasesPerScenario: number;
    aiPercentage: number;
    manualPercentage: number;
    targetAchievement: number;
}

interface StatsBarProps {
    stats: StatsData;
    total?: number;
}

export const StatsBar: React.FC<StatsBarProps> = ({ stats, total }) => {
    return (
        <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 text-center">
                <div className="text-3xl font-bold text-indigo-600 mb-1">{stats.scenarios}</div>
                <div className="text-sm text-gray-500">测试场景</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 text-center">
                <div className="text-3xl font-bold text-indigo-600 mb-1">{stats.testPoints}</div>
                <div className="text-sm text-gray-500">测试点</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 text-center relative">
                <div className="text-3xl font-bold text-indigo-600 mb-1">{total || stats.testCases}</div>
                <div className="text-sm text-gray-500">测试用例</div>
                <div className="absolute top-2 right-2 flex gap-1.5 text-xs">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700">
                        <Bot className="w-3 h-3 mr-0.5" /> {stats.aiCount}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600">
                        <User className="w-3 h-3 mr-0.5" /> {stats.manualCount}
                    </span>
                </div>
            </div>
            <Tooltip 
                title={
                    <div className="text-xs">
                        <div className="font-medium mb-1">场景覆盖率：</div>
                        <div>目标：每场景 3 个用例</div>
                        <div>当前：每场景 {stats.avgCasesPerScenario} 个用例</div>
                        <div className="mt-1 text-gray-300">
                            计算公式: (实际密度 / 目标密度) × 100% = ({stats.avgCasesPerScenario} / 3) × 100%
                        </div>
                        <div className="mt-2 pt-2 border-t border-gray-600">
                            <div>AI 生成：{stats.aiCount} 个 ({stats.aiPercentage}%)</div>
                            <div>人工创建：{stats.manualCount} 个 ({stats.manualPercentage}%)</div>
                        </div>
                    </div>
                }
                placement="bottom"
                styles={{ body: { minWidth: '360px' } }}
            >
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 text-center relative cursor-help">
                    <div className="text-3xl font-bold text-green-600 mb-1">
                        {stats.targetAchievement}%
                    </div>
                    <div className="text-sm text-gray-500">覆盖率</div>
                    <div className="absolute top-2 right-2 flex gap-1 text-xs">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700">
                            AI {stats.aiPercentage}%
                        </span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600">
                            人 {stats.manualPercentage}%
                        </span>
                    </div>
                </div>
            </Tooltip>
        </div>
    );
};

