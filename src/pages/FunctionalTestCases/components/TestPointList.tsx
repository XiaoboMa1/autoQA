import React from 'react';
import { Trash2, Edit2 } from 'lucide-react';
import { clsx } from 'clsx';
import { TestPointItem } from '../types';

interface TestPointListProps {
    testPoints: TestPointItem[];
    onEdit: (point: TestPointItem) => void;
    onDelete: (pointId: number, pointName: string) => void;
    selectedPoints: Set<number>;
    onToggleSelect: (pointId: number) => void;
}

export const TestPointList: React.FC<TestPointListProps> = ({
    testPoints,
    onEdit,
    onDelete,
    selectedPoints,
    onToggleSelect
}) => {
    const getRiskColor = (level: string) => {
        switch (level) {
            case 'high': return 'text-red-600 bg-red-50 border-red-100';
            case 'medium': return 'text-orange-600 bg-orange-50 border-orange-100';
            case 'low': return 'text-green-600 bg-green-50 border-green-100';
            default: return 'text-gray-600 bg-gray-50 border-gray-100';
        }
    };

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50/50">
                    <tr>
                        <th className="w-12 px-4 py-3 text-center">
                            <span className="sr-only">Select</span>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Test Point</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/4">Steps</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/4">Expected Result</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Risk</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                    {testPoints.map((point) => (
                        <tr
                            key={point.id}
                            className={clsx(
                                "group transition-colors hover:bg-blue-50/30",
                                selectedPoints.has(point.id) && "bg-blue-50/50"
                            )}
                        >
                            <td className="px-4 py-3 text-center">
                                <input
                                    type="checkbox"
                                    checked={selectedPoints.has(point.id)}
                                    onChange={() => onToggleSelect(point.id)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                                #{point.test_point_index}
                            </td>
                            <td className="px-4 py-3">
                                <div className="text-sm font-medium text-gray-900 mb-1">{point.test_point_name}</div>
                                <div className="text-xs text-gray-500 line-clamp-1" title={point.test_purpose}>
                                    {point.test_purpose}
                                </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                                <div className="whitespace-pre-wrap line-clamp-3 font-mono text-xs bg-gray-50 p-2 rounded border border-gray-100">
                                    {point.steps}
                                </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                                <div className="whitespace-pre-wrap line-clamp-3 font-mono text-xs bg-gray-50 p-2 rounded border border-gray-100">
                                    {point.expected_result}
                                </div>
                            </td>
                            <td className="px-4 py-3">
                                <span className={clsx(
                                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                                    getRiskColor(point.risk_level)
                                )}>
                                    {point.risk_level}
                                </span>
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => onEdit(point)}
                                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                        title="Edit Test Point"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => onDelete(point.id, point.test_point_name)}
                                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                        title="Delete Test Point"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
