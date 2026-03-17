import React from 'react';
import { LayoutGrid, Table2, Trello, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { ViewMode } from '../types';

interface ViewSwitcherProps {
    currentView: ViewMode;
    onViewChange: (view: ViewMode) => void;
}

const viewOptions = [
    { mode: 'table' as ViewMode, label: '表格视图', icon: Table2 },
    { mode: 'card' as ViewMode, label: '卡片视图', icon: LayoutGrid },
    { mode: 'kanban' as ViewMode, label: '看板视图', icon: Trello },
    { mode: 'timeline' as ViewMode, label: '时间线视图', icon: Clock },
];

export const ViewSwitcher: React.FC<ViewSwitcherProps> = ({ currentView, onViewChange }) => {
    return (
        <div className="inline-flex items-center bg-white rounded-lg border border-gray-200 shadow-sm p-1">
            {viewOptions.map(({ mode, label, icon: Icon }) => (
                <button
                    key={mode}
                    onClick={() => onViewChange(mode)}
                    className={clsx(
                        'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                        currentView === mode
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    )}
                    title={label}
                >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{label}</span>
                </button>
            ))}
        </div>
    );
};
