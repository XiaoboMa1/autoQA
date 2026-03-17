import React, { useMemo } from 'react';
import { Edit3, Trash2, Box, Layers, Calendar, User, Target } from 'lucide-react';
import { clsx } from 'clsx';
import { ViewProps, TestCaseItem } from '../types';

export const KanbanView: React.FC<ViewProps> = ({
    organizedData,
    loading,
    onViewDetail,
    onEditCase,
    onDeleteCase,
    onExecuteCase,
}) => {
    // 按状态分组
    const groupedByStatus = useMemo(() => {
        // 收集所有测试用例，遍历场景 -> 测试点 -> 用例
        const allCases: TestCaseItem[] = organizedData.flatMap(scenario =>
            (scenario.testPoints || []).flatMap(point => point.testCases || [])
        );

        return {
            DRAFT: allCases.filter(tc => tc.executionStatus === 'pending'),
            PUBLISHED: allCases.filter(tc => tc.executionStatus === 'pass'),
            ARCHIVED: allCases.filter(tc => tc.executionStatus === 'fail' || tc.executionStatus === 'block'),
        };
    }, [organizedData]);

    const statusConfig = [
        {
            key: 'DRAFT',
            label: '草稿',
            color: 'bg-yellow-50 border-yellow-200',
            headerColor: 'bg-yellow-100 text-yellow-800',
            count: groupedByStatus.DRAFT.length,
        },
        {
            key: 'PUBLISHED',
            label: '已发布',
            color: 'bg-green-50 border-green-200',
            headerColor: 'bg-green-100 text-green-800',
            count: groupedByStatus.PUBLISHED.length,
        },
        {
            key: 'ARCHIVED',
            label: '已归档',
            color: 'bg-gray-50 border-gray-200',
            headerColor: 'bg-gray-100 text-gray-800',
            count: groupedByStatus.ARCHIVED.length,
        },
    ];

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'critical': return 'bg-red-100 text-red-700 border-red-200';
            case 'high': return 'bg-orange-100 text-orange-700 border-orange-200';
            case 'medium': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'low': return 'bg-gray-100 text-gray-700 border-gray-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    const getPriorityText = (priority: string) => {
        switch (priority) {
            case 'critical': return '紧急';
            case 'high': return '高';
            case 'medium': return '中';
            case 'low': return '低';
            default: return priority;
        }
    };

    const KanbanCard: React.FC<{ testCase: TestCaseItem }> = ({ testCase }) => (
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all cursor-pointer group">
            <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 flex-1" title={testCase.name}>
                    {testCase.name}
                </h3>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onEditCase(testCase.id);
                        }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="编辑"
                    >
                        <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDeleteCase(testCase.id, testCase.name);
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="删除"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {testCase.description && (
                <p className="text-xs text-gray-600 mb-3 line-clamp-2">{testCase.description}</p>
            )}

            <div className="flex items-center gap-2 mb-3">
                <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium border', getPriorityColor(testCase.priority))}>
                    {getPriorityText(testCase.priority)}
                </span>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Target className="w-3.5 h-3.5" />
                    <span>{/* 测试点数量可在详情中查看 */}</span>
                </div>
            </div>

            <div className="space-y-1.5 text-xs text-gray-500">
                <div className="flex items-center gap-1.5">
                    <Box className="w-3.5 h-3.5" />
                    <span>{testCase.system}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>{testCase.module}</span>
                </div>
                {testCase.users?.username && (
                    <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        <span>{testCase.users.username}</span>
                    </div>
                )}
                <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(testCase.created_at).toLocaleDateString('zh-CN')}</span>
                </div>
            </div>
        </div>
    );

    if (loading) {
        return (
            <div className="text-center py-20">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-gray-500 mt-4">加载测试用例中...</p>
            </div>
        );
    }

    const totalCases = Object.values(groupedByStatus).reduce((sum, cases) => sum + cases.length, 0);

    if (totalCases === 0) {
        return (
            <div className="text-center py-20 bg-white rounded-xl border border-gray-200 border-dashed">
                <p className="text-gray-500">未找到符合条件的测试用例</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {statusConfig.map(({ key, label, color, headerColor, count }) => (
                <div key={key} className={clsx('rounded-xl border-2', color)}>
                    {/* 列头 */}
                    <div className={clsx('px-4 py-3 rounded-t-lg flex items-center justify-between', headerColor)}>
                        <h3 className="font-semibold text-sm">{label}</h3>
                        <span className="px-2 py-0.5 bg-white/50 rounded-full text-xs font-medium">
                            {count}
                        </span>
                    </div>

                    {/* 卡片列表 */}
                    <div className="p-3 space-y-3 min-h-[400px] max-h-[calc(100vh-300px)] overflow-y-auto">
                        {groupedByStatus[key as keyof typeof groupedByStatus].map(testCase => (
                            <KanbanCard key={testCase.id} testCase={testCase} />
                        ))}
                        {count === 0 && (
                            <div className="text-center py-8 text-gray-400 text-sm">
                                暂无{label}用例
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};
