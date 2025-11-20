import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { clsx } from 'clsx';
import { useTabs } from '../contexts/TabContext';
import { TabItem } from './TabItem';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';

export const TabBar: React.FC = () => {
  const { tabs, activeTabId, setActiveTab, removeTab, closeOtherTabs, closeRightTabs, closeAllTabs } = useTabs();
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(false);
  const [contextMenuTabId, setContextMenuTabId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 检查是否需要显示滚动按钮
  const checkScroll = () => {
    const container = scrollContainerRef.current;
    if (container) {
      setShowLeftScroll(container.scrollLeft > 0);
      setShowRightScroll(
        container.scrollLeft < container.scrollWidth - container.clientWidth - 1
      );
    }
  };

  useEffect(() => {
    checkScroll();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      return () => {
        container.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      };
    }
  }, [tabs]);

  // 滚动Tab栏
  const scrollTabs = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (container) {
      const scrollAmount = 200;
      const newScrollLeft = direction === 'left'
        ? container.scrollLeft - scrollAmount
        : container.scrollLeft + scrollAmount;
      container.scrollTo({ left: newScrollLeft, behavior: 'smooth' });
    }
  };

  // 右键菜单
  const getContextMenuItems = (tabId: string): MenuProps['items'] => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return [];

    const items: MenuProps['items'] = [];

    if (tab.closable) {
      items.push({
        key: 'close',
        label: '关闭',
        onClick: () => removeTab(tabId),
      });
    }

    if (tabs.length > 2) { // 除了首页还有其他Tab
      items.push({
        key: 'close-others',
        label: '关闭其他',
        onClick: () => closeOtherTabs(tabId),
      });
    }

    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (tabIndex < tabs.length - 1) {
      items.push({
        key: 'close-right',
        label: '关闭右侧',
        onClick: () => closeRightTabs(tabId),
      });
    }

    if (tabs.some(t => t.closable)) {
      items.push(
        { type: 'divider' },
        {
          key: 'close-all',
          label: '关闭所有',
          onClick: closeAllTabs,
        }
      );
    }

    return items;
  };

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenuTabId(tabId);
  };

  return (
    <div className="relative flex items-center h-12 bg-[var(--color-bg-primary)] border-b border-[var(--color-border)] shadow-sm">
      {/* 左侧滚动按钮 */}
      {showLeftScroll && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex-shrink-0 flex items-center justify-center w-8 h-full bg-gradient-to-r from-[var(--color-bg-primary)] to-transparent hover:bg-[var(--color-bg-secondary)] transition-colors z-10"
          onClick={() => scrollTabs('left')}
          aria-label="向左滚动"
        >
          <ChevronLeft className="h-4 w-4 text-[var(--color-text-secondary)]" />
        </motion.button>
      )}

      {/* Tab容器 */}
      <div
        ref={scrollContainerRef}
        className="flex-1 flex items-center overflow-x-auto scrollbar-hide"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        <AnimatePresence mode="popLayout">
          {tabs.map((tab) => (
            <Dropdown
              key={tab.id}
              menu={{ items: getContextMenuItems(tab.id) }}
              trigger={['contextMenu']}
            >
              <div>
                <TabItem
                  tab={tab}
                  isActive={activeTabId === tab.id}
                  onSelect={() => setActiveTab(tab.id)}
                  onClose={() => removeTab(tab.id)}
                  onContextMenu={(e) => handleContextMenu(e, tab.id)}
                />
              </div>
            </Dropdown>
          ))}
        </AnimatePresence>
      </div>

      {/* 右侧滚动按钮 */}
      {showRightScroll && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex-shrink-0 flex items-center justify-center w-8 h-full bg-gradient-to-l from-[var(--color-bg-primary)] to-transparent hover:bg-[var(--color-bg-secondary)] transition-colors z-10"
          onClick={() => scrollTabs('right')}
          aria-label="向右滚动"
        >
          <ChevronRight className="h-4 w-4 text-[var(--color-text-secondary)]" />
        </motion.button>
      )}

      {/* Tab管理下拉菜单 */}
      <Dropdown
        menu={{
          items: [
            {
              key: 'close-all',
              label: '关闭所有标签页',
              onClick: closeAllTabs,
              disabled: tabs.length === 1,
            },
          ],
        }}
        placement="bottomRight"
        trigger={['click']}
      >
        <button
          className={clsx(
            'flex-shrink-0 flex items-center justify-center w-10 h-full',
            'hover:bg-[var(--color-bg-secondary)] transition-colors',
            'border-l border-[var(--color-border)]'
          )}
          aria-label="标签页管理"
        >
          <MoreHorizontal className="h-4 w-4 text-[var(--color-text-secondary)]" />
        </button>
      </Dropdown>
    </div>
  );
};
