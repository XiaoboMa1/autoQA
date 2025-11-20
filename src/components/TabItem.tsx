import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import type { Tab } from '../contexts/TabContext';

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export const TabItem: React.FC<TabItemProps> = ({
  tab,
  isActive,
  onSelect,
  onClose,
  onContextMenu,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tab.closable) {
      onClose();
    }
  };

  const handleMiddleClick = (e: React.MouseEvent) => {
    // 鼠标中键关闭Tab
    if (e.button === 1 && tab.closable) {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.2 }}
      className={clsx(
        'group relative flex items-center h-10 px-3 cursor-pointer select-none transition-all duration-200',
        'border-r border-[var(--color-border)]',
        'min-w-[120px] max-w-[240px]',
        {
          'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-md': isActive,
          'bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]': !isActive,
        }
      )}
      onClick={onSelect}
      onMouseDown={handleMiddleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={onContextMenu}
    >
      {/* Tab图标 */}
      <div className="flex-shrink-0 mr-2">
        {tab.icon}
      </div>

      {/* Tab标题 */}
      <span className={clsx(
        'flex-1 text-sm font-medium truncate',
        {
          'text-white': isActive,
          'text-[var(--color-text-primary)]': !isActive,
        }
      )}>
        {tab.title}
      </span>

      {/* 关闭按钮 */}
      {tab.closable && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{
            opacity: isActive || isHovered ? 1 : 0,
            scale: isActive || isHovered ? 1 : 0.8,
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className={clsx(
            'flex-shrink-0 ml-2 p-1 rounded-md transition-colors',
            {
              'hover:bg-white/20 text-white': isActive,
              'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500': !isActive,
            }
          )}
          onClick={handleClose}
          aria-label="关闭标签页"
        >
          <X className="h-3 w-3" />
        </motion.button>
      )}

      {/* 激活指示器 */}
      {isActive && (
        <motion.div
          layoutId="activeTabIndicator"
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-white"
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        />
      )}
    </motion.div>
  );
};
