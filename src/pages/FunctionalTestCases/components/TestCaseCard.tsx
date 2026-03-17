import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Edit3, Trash2, Box, Layers, Calendar, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { TestCaseItem, TestPointGroup } from '../types';

/**
 * 卡片式展示单个测试用例的基本信息。
 * 展开后可展示关联的 TestPoint 的步骤和预期结果。
 */
interface TestCaseCardProps {
    /** 测试用例数据 */
    testCase: TestCaseItem;
    /** 所属测试点数据（可选，用于展示步骤和预期结果） */
    testPoint?: TestPointGroup;
    /** 编辑用例回调 */
    onEditCase: (id: number) => void;
    /** 删除用例回调 */
    onDeleteCase: (id: number, name: string) => void;
    /** 编辑测试点（暂未使用） */
    onEditPoint?: (point: TestPointGroup) => void;
    /** 删除测试点（暂未使用） */
    onDeletePoint?: (pointId: number, pointName: string) => void;
    /** 已选中的测试点集合 */
    selectedPoints: Set<number>;
    /** 切换测试点选中状态（暂未使用） */
    onToggleSelectPoint?: (pointId: number) => void;
    /** 是否默认展开 */
    defaultExpanded?: boolean;
}

export const TestCaseCard: React.FC<TestCaseCardProps> = ({
    testCase,
    testPoint,
    onEditCase,
    onDeleteCase,
    defaultExpanded = false,
}) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'critical':
                return 'bg-red-100 text-red-700 border-red-200';
            case 'high':
                return 'bg-orange-100 text-orange-700 border-orange-200';
            case 'medium':
                return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'low':
                return 'bg-gray-100 text-gray-700 border-gray-200';
            default:
                return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'PUBLISHED':
                return 'bg-green-100 text-green-700 border-green-200';
            case 'DRAFT':
                return 'bg-yellow-100 text-yellow-700 border-yellow-200';
            case 'ARCHIVED':
                return 'bg-gray-100 text-gray-700 border-gray-200';
            default:
                return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all hover:shadow-md">
            {/* Header */}
            <div
                className="p-4 flex items-start gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <button className="mt-1 p-1 hover:bg-gray-200 rounded-md transition-colors text-gray-400">
                    {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 truncate" title={testCase.name}>
                            {testCase.name}
                        </h3>
                        <span className={clsx('px-2.5 py-0.5 rounded-full text-xs font-medium border', getPriorityColor(testCase.priority))}>
                            {testCase.priority}
                        </span>
                        <span className={clsx('px-2.5 py-0.5 rounded-full text-xs font-medium border', getStatusColor(testCase.status))}>
                            {testCase.status}
                        </span>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-gray-500">
                        <div className="flex items-center gap-1.5">
                            <Box className="w-4 h-4" />
                            <span>{testCase.system}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Layers className="w-4 h-4" />
                            <span>{testCase.module}</span>
                        </div>
                        {testCase.users?.username && (
                            <div className="flex items-center gap-1.5">
                                <User className="w-4 h-4" />
                                <span>{testCase.users.username}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4" />
                            <span>{new Date(testCase.created_at).toLocaleDateString('zh-CN')}</span>
                        </div>
                    </div>
                    {testCase.description && (
                        <p className="mt-2 text-sm text-gray-600 line-clamp-2">{testCase.description}</p>
                    )}
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button
                        onClick={() => onEditCase(testCase.id)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="编辑"
                    >
                        <Edit3 className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => onDeleteCase(testCase.id, testCase.name)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="删除"
                    >
                        <Trash2 className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Body – 展开后展示关联的 TestPoint 信息 */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-gray-100"
                    >
                        <div className="p-4 bg-gray-50/30">
                            {testPoint ? (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-sm text-gray-700 font-medium">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                        所属测试点：{testPoint.test_point_name}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">测试步骤</h4>
                                            <div className="bg-white rounded-lg border border-gray-200 p-3 text-sm text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">
                                                {testPoint.steps || '无步骤描述'}
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">预期结果</h4>
                                            <div className="bg-white rounded-lg border border-gray-200 p-3 text-sm text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">
                                                {testPoint.expected_result || '无预期结果'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 text-center py-2">暂无关联测试点信息</p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
