import { useEffect } from 'react';
import { useTabs } from '../contexts/TabContext';

export const useTabShortcuts = () => {
  const { tabs, activeTabId, setActiveTab, removeTab } = useTabs();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      // Ctrl/Cmd + W: 关闭当前Tab
      if (modifier && e.key === 'w') {
        e.preventDefault();
        const activeTab = tabs.find(tab => tab.id === activeTabId);
        if (activeTab && activeTab.closable) {
          removeTab(activeTabId);
        }
      }

      // Ctrl/Cmd + Tab: 切换到下一个Tab
      if (modifier && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const currentIndex = tabs.findIndex(tab => tab.id === activeTabId);
        const nextIndex = (currentIndex + 1) % tabs.length;
        setActiveTab(tabs[nextIndex].id);
      }

      // Ctrl/Cmd + Shift + Tab: 切换到上一个Tab
      if (modifier && e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        const currentIndex = tabs.findIndex(tab => tab.id === activeTabId);
        const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        setActiveTab(tabs[prevIndex].id);
      }

      // Ctrl/Cmd + 数字键(1-9): 快速跳转到指定Tab
      if (modifier && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (index < tabs.length) {
          setActiveTab(tabs[index].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [tabs, activeTabId, setActiveTab, removeTab]);
};
