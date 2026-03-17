import React from 'react';
import { ViewProps } from '../types';
import { TestCaseCard } from '../components/TestCaseCard';

export const CardView: React.FC<ViewProps> = ({
    organizedData,
    loading,
    selectedPoints,
    onToggleSelectPoint,
    onViewDetail,
    onEditCase,
    onDeleteCase,
    onEditPoint,
    onDeletePoint,
    onExecuteCase,
}) => {
    if (loading) {
        return (
            <div className="text-center py-20">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-gray-500 mt-4">加载测试用例中...</p>
            </div>
        );
    }

    if (organizedData.length === 0) {
        return (
            <div className="text-center py-20 bg-white rounded-xl border border-gray-200 border-dashed">
                <p className="text-gray-500">未找到符合条件的测试用例</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {organizedData.map((scenario) => {
                const allCaseItems = (scenario.testPoints || []).flatMap((point) =>
                    (point.testCases || []).map(testCase => ({ testCase, point }))
                );
                return (
                    <div key={scenario.name} className="space-y-4">
                        <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2 pl-1">
                            <span className="w-1 h-5 bg-blue-500 rounded-full"></span>
                            {scenario.name}
                            <span className="text-sm font-normal text-gray-400 ml-2">
                                ({allCaseItems.length} 个用例)
                            </span>
                        </h2>
                        <div className="grid gap-4">
                            {allCaseItems.map(({ testCase, point }) => (
                                <TestCaseCard
                                    key={testCase.id}
                                    testCase={testCase}
                                    testPoint={point}
                                    onEditCase={onEditCase}
                                    onDeleteCase={onDeleteCase}
                                    onEditPoint={onEditPoint}
                                    onDeletePoint={onDeletePoint}
                                    selectedPoints={selectedPoints}
                                    onToggleSelectPoint={onToggleSelectPoint}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
