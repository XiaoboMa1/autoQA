import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Timeline, Tag, Empty, Spin, Image } from 'antd';
import { CheckCircle, XCircle, AlertCircle, Clock, FileText } from 'lucide-react';
import { ExecutionResult, ExecutionLog } from '../types';
import { functionalTestCaseService } from '../../../services/functionalTestCaseService';

interface ExecutionLogModalProps {
    isOpen: boolean;
    onClose: () => void;
    caseId: number;
}

interface ExecutionRecord {
    executionId: string;
    finalResult: string;
    actualResult?: string;
    comments?: string;
    durationMs?: number;
    executedAt: string;
    executor?: {
        username?: string;
        account_name?: string;
    };
    stepResults?: unknown[];
    totalSteps?: number;
    completedSteps?: number;
    passedSteps?: number;
    failedSteps?: number;
    blockedSteps?: number;
    screenshots?: Array<{
        fileName?: string;
        filename?: string;
        fileSize?: number;
        mimeType?: string;
        base64Data?: string;
        uploadedAt?: string;
    }>;
    attachments?: unknown[];
}

export const ExecutionLogModal: React.FC<ExecutionLogModalProps> = ({
    isOpen,
    onClose,
    caseId
}) => {
    const [logs, setLogs] = useState<ExecutionLog[]>([]);
    const [loading, setLoading] = useState(false);

    // 后端和前端现在使用相同的值，无需映射
    const mapFinalResultToStatus = useCallback((finalResult: string): ExecutionResult => {
        // 确保返回标准的执行结果值
        if (['pass', 'fail', 'block', 'skip'].includes(finalResult)) {
            return finalResult as ExecutionResult;
        }
        return 'pending';
    }, []);

    const loadLogs = useCallback(async () => {
        setLoading(true);
        try {
            const result = await functionalTestCaseService.getExecutionHistory(caseId, 20) as { 
                success: boolean; 
                data: ExecutionRecord[] 
            };
            
            if (result.success && result.data) {
                // 转换后端数据格式到前端格式
                const logs: ExecutionLog[] = result.data.map((exec) => ({
                    id: exec.executionId,
                    status: mapFinalResultToStatus(exec.finalResult),
                    executor: exec.executor?.username || exec.executor?.account_name || '未知',
                    time: exec.executedAt,
                    comment: exec.comments,
                    actualResult: exec.actualResult,
                    durationMs: exec.durationMs,
                    stepResults: exec.stepResults,
                    totalSteps: exec.totalSteps,
                    completedSteps: exec.completedSteps,
                    passedSteps: exec.passedSteps,
                    failedSteps: exec.failedSteps,
                    blockedSteps: exec.blockedSteps,
                    screenshots: exec.screenshots,
                    attachments: exec.attachments,
                }));
                
                setLogs(logs);
            }
        } catch (error) {
            console.error('加载执行日志失败:', error);
            setLogs([]);
        } finally {
            setLoading(false);
        }
    }, [caseId, mapFinalResultToStatus]);

    useEffect(() => {
        if (isOpen && caseId) {
            loadLogs();
        }
    }, [isOpen, caseId, loadLogs]);

    const formatDuration = (ms?: number) => {
        if (!ms) return '-';
        if (ms < 1000) return `${ms}毫秒`;
        return `${(ms / 1000).toFixed(2)}秒`;
    };

    const getStatusIcon = (status: ExecutionResult) => {
        switch (status) {
            case 'pass':
                return <CheckCircle className="w-5 h-5 text-green-500" />;
            case 'fail':
                return <XCircle className="w-5 h-5 text-red-500" />;
            case 'block':
                return <AlertCircle className="w-5 h-5 text-orange-500" />;
            case 'skip':
                return <Clock className="w-5 h-5 text-blue-400" />;
            default:
                return <Clock className="w-5 h-5 text-gray-400" />;
        }
    };

    const getStatusTag = (status: ExecutionResult) => {
        switch (status) {
            case 'pass':
                return <Tag color="success">通过</Tag>;
            case 'fail':
                return <Tag color="error">失败</Tag>;
            case 'block':
                return <Tag color="warning">阻塞</Tag>;
            case 'skip':
                return <Tag color="default">跳过</Tag>;
            default:
                return <Tag color="default">-</Tag>;
        }
    };

    const getStatusColor = (status: ExecutionResult) => {
        switch (status) {
            case 'pass': return 'green';
            case 'fail': return 'red';
            case 'block': return 'orange';
            case 'skip': return 'blue';
            default: return 'gray';
        }
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-500" />
                    <span className="font-bold">执行日志</span>
                </div>
            }
            open={isOpen}
            onCancel={onClose}
            footer={null}
            width={800}
            className="execution-log-modal"
            styles={{ 
                body: {
                    maxHeight: '70vh', 
                    overflowY: 'auto',
                    padding: '16px 24px'
                }
            }}
        >
            <div className="py-4">
                {loading ? (
                    <div className="text-center py-12">
                        <Spin size="large" />
                        <p className="text-gray-500 mt-4">加载执行日志中...</p>
                    </div>
                ) : logs.length === 0 ? (
                    <Empty
                        description="暂无执行记录"
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                ) : (
                    <Timeline
                        items={logs.map(log => ({
                            dot: getStatusIcon(log.status),
                            color: getStatusColor(log.status),
                            children: (
                                <div className="pb-4">
                                    {/* 基本信息行 */}
                                    <div className="flex items-center gap-3 mb-3">
                                        {getStatusTag(log.status)}
                                        <span className="text-sm text-gray-500">
                                            {new Date(log.time).toLocaleString('zh-CN')}
                                        </span>
                                        <span className="text-sm font-medium text-gray-700">
                                            执行人: {log.executor}
                                        </span>
                                        {log.durationMs && (
                                            <span className="text-sm text-gray-500">
                                                耗时: {formatDuration(log.durationMs)}
                                            </span>
                                        )}
                                    </div>

                                    {/* 步骤统计信息 */}
                                    {log.totalSteps !== undefined && log.totalSteps > 0 && (
                                        <div className="mb-3 p-2 bg-gray-50 rounded border border-gray-200">
                                            <div className="flex gap-4 text-xs">
                                                <span className="text-gray-600">
                                                    总步骤: <span className="font-semibold text-gray-800">{log.totalSteps}</span>
                                                </span>
                                                {log.completedSteps !== undefined && (
                                                    <span className="text-blue-600">
                                                        已完成: <span className="font-semibold">{log.completedSteps}</span>
                                                    </span>
                                                )}
                                                {log.passedSteps !== undefined  && (
                                                    <span className="text-green-600">
                                                        ✓ 通过: <span className="font-semibold">{log.passedSteps}</span>
                                                    </span>
                                                )}
                                                {log.failedSteps !== undefined && (
                                                    <span className="text-red-600">
                                                        ✗ 失败: <span className="font-semibold">{log.failedSteps}</span>
                                                    </span>
                                                )}
                                                {log.blockedSteps !== undefined && (
                                                    <span className="text-orange-600">
                                                        ⚠ 受阻: <span className="font-semibold">{log.blockedSteps}</span>
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* 实际结果 */}
                                    {log.actualResult && (
                                        <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                            <div className="text-xs font-semibold text-blue-800 mb-1">实际结果总结</div>
                                            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                                                {log.actualResult}
                                            </p>
                                        </div>
                                    )}

                                    {/* 备注 */}
                                    {log.comment && (
                                        <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                            <div className="text-xs font-semibold text-gray-700 mb-1">备注</div>
                                            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                                                {log.comment}
                                            </p>
                                        </div>
                                    )}

                                    {/* 截图预览 */}
                                    {log.screenshots && log.screenshots.length > 0 && (
                                        <div className="mt-3">
                                            <div className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                                                📷 截图: 共 {log.screenshots.length} 张
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <Image.PreviewGroup>
                                                    {log.screenshots.map((screenshot, index) => {
                                                        // 构建完整的 Data URL
                                                        const mimeType = screenshot.mimeType || 'image/png';
                                                        const base64Data = screenshot.base64Data || '';
                                                        // 如果 base64Data 已经包含 data: 前缀，直接使用；否则添加前缀
                                                        const imageUrl = base64Data.startsWith('data:') 
                                                            ? base64Data 
                                                            : `data:${mimeType};base64,${base64Data}`;
                                                        
                                                        return (
                                                            <Image
                                                                key={index}
                                                                src={imageUrl}
                                                                alt={screenshot.fileName || screenshot.filename || `截图${index + 1}`}
                                                                width={100}
                                                                height={100}
                                                                className="rounded border border-gray-200 object-cover cursor-pointer hover:border-blue-400 transition-colors"
                                                                style={{ objectFit: 'cover' }}
                                                                preview={{
                                                                    mask: (
                                                                        <div className="text-xs">
                                                                            {/* <span className="text-while-500">
                                                                                {screenshot.fileName || screenshot.filename || `截图${index + 1}`}
                                                                            </span> */}
                                                                            点击预览
                                                                        </div>
                                                                    )
                                                                }}
                                                            />
                                                        );
                                                    })}
                                                </Image.PreviewGroup>
                                            </div>
                                        </div>
                                    )}

                                    {/* 附件统计 */}
                                    {log.attachments && log.attachments.length > 0 && (
                                        <div className="mt-2 text-xs text-gray-500">
                                            <span className="flex items-center gap-1">
                                                📎 附件: <span className="font-medium text-gray-700">{log.attachments.length}</span> 个
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )
                        }))}
                    />
                )}
            </div>
        </Modal>
    );
};
