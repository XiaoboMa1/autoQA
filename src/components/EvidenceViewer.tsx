import React, { useEffect, useMemo, useState } from 'react';
import { Button } from './ui/button';

interface EvidenceViewerProps {
  runId: string;
}

interface ArtifactRecord {
  runId: string;
  type: 'trace' | 'video' | 'screenshot' | 'log';
  filename: string;
  size: number;
  createdAt: string;
}

export const EvidenceViewer: React.FC<EvidenceViewerProps> = ({ runId }) => {
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [stepFilter, setStepFilter] = useState<'all' | string>('all');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const extractStep = (filename: string) => {
    const m = filename.match(/-step-(\d+)-/);
    return m ? parseInt(m[1], 10) : null;
  };

  const screenshotsAll = useMemo(() => artifacts.filter(a => a.type === 'screenshot'), [artifacts]);
  const steps = useMemo(() => {
    const set = new Set<number>();
    screenshotsAll.forEach(s => {
      const st = extractStep(s.filename);
      if (st != null) set.add(st);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [screenshotsAll]);

  const screenshotsFiltered = useMemo(() => {
    if (stepFilter === 'all') return screenshotsAll;
    const stepNum = parseInt(stepFilter, 10);
    return screenshotsAll.filter(s => extractStep(s.filename) === stepNum);
  }, [screenshotsAll, stepFilter]);

  const nonScreenshots = useMemo(() => artifacts.filter(a => a.type !== 'screenshot'), [artifacts]);

  const getSignedUrl = async (filename: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/evidence/${runId}/sign/${filename}`);
      const data = await res.json();
      if (data.success) return data.data.signedUrl;
    } catch (e) {
      console.error('获取签名URL失败:', e);
    }
    return null;
  };

  const getScreenshotIndexByFilename = (fn: string) =>
    screenshotsFiltered.findIndex(s => s.filename === fn);

  const openPreview = async (index: number) => {
    const file = screenshotsFiltered[index];
    if (!file) return;
    const url = await getSignedUrl(file.filename);
    if (url) {
      setPreviewIndex(index);
      setPreviewUrl(url);
    }
  };

  const closePreview = () => {
    setPreviewIndex(null);
    setPreviewUrl(null);
  };

  const showPrev = async () => {
    if (previewIndex == null || screenshotsFiltered.length === 0) return;
    const nextIdx = (previewIndex - 1 + screenshotsFiltered.length) % screenshotsFiltered.length;
    const url = await getSignedUrl(screenshotsFiltered[nextIdx].filename);
    if (url) {
      setPreviewIndex(nextIdx);
      setPreviewUrl(url);
    }
  };

  const showNext = async () => {
    if (previewIndex == null || screenshotsFiltered.length === 0) return;
    const nextIdx = (previewIndex + 1) % screenshotsFiltered.length;
    const url = await getSignedUrl(screenshotsFiltered[nextIdx].filename);
    if (url) {
      setPreviewIndex(nextIdx);
      setPreviewUrl(url);
    }
  };

  useEffect(() => {
    fetchArtifacts();
  }, [runId]);

  const fetchArtifacts = async () => {
    try {
      const response = await fetch(`/api/evidence/${runId}/files`);
      const data = await response.json();
      setArtifacts(data.data || []);
    } catch (error) {
      console.error('获取证据文件失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (filename: string) => {
    try {
      setDownloading(filename);
      const response = await fetch(`/api/evidence/${runId}/sign/${filename}`);
      const data = await response.json();
      
      if (data.success) {
        // 创建下载链接
        const link = document.createElement('a');
        link.href = data.data.signedUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('下载失败:', error);
    } finally {
      setDownloading(null);
    }
  };

  // 🔥 修正：Trace Viewer使用绝对URL
  const handleViewTrace = async (filename: string) => {
    try {
      const response = await fetch(`/api/evidence/${runId}/sign/${filename}`);
      const data = await response.json();
      
      if (data.success) {
        // 使用绝对URL打开Trace Viewer
        const traceViewerUrl = `https://trace.playwright.dev/?trace=${encodeURIComponent(data.data.signedUrl)}`;
        window.open(traceViewerUrl, '_blank');
      }
    } catch (error) {
      console.error('打开Trace查看器失败:', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'trace': return '🔍';
      case 'video': return '📹';
      case 'screenshot': return '📸';
      case 'log': return '📝';
      default: return '📄';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'trace': return 'text-blue-600 bg-blue-100';
      case 'video': return 'text-green-600 bg-green-100';
      case 'screenshot': return 'text-orange-600 bg-orange-100';
      case 'log': return 'text-purple-600 bg-purple-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="evidence-viewer p-4">
        <div className="flex items-center justify-center h-32">
          <div className="text-gray-500">加载证据文件中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="evidence-viewer p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">测试证据</h3>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">步骤</label>
          <select
            value={stepFilter}
            onChange={(e) => setStepFilter(e.target.value)}
            className="px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="all">全部</option>
            {steps.map((s) => (
              <option key={s} value={String(s)}>{`第${s}步`}</option>
            ))}
          </select>
          <Button onClick={fetchArtifacts} disabled={loading}>
            刷新
          </Button>
        </div>
      </div>
      
      {artifacts.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          暂无证据文件
        </div>
      ) : (
        <div className="space-y-6">
          {/* 截图区（网格展示） */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-md font-semibold">截图 ({screenshotsFiltered.length})</h4>
            </div>
            {screenshotsFiltered.length === 0 ? (
              <div className="text-gray-500 text-sm">无符合筛选的截图</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {screenshotsFiltered.map((item, idx) => (
                  <div key={idx} className="group relative bg-white border rounded-lg overflow-hidden">
                    <button
                      onClick={() => openPreview(idx)}
                      className="block w-full aspect-video bg-gray-100"
                      title={item.filename}
                    >
                      <div className="flex items-center justify-center w-full h-full text-3xl">📸</div>
                    </button>
                    <div className="p-2 flex items-center justify-between gap-2">
                      <div className="text-xs truncate" title={item.filename}>{item.filename}</div>
                      <Button size="sm" variant="outline" onClick={() => handleDownload(item.filename)}>下载</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 其他证据文件（列表） */}
          <div>
            <h4 className="text-md font-semibold mb-2">其他文件 ({nonScreenshots.length})</h4>
            {nonScreenshots.length === 0 ? (
              <div className="text-gray-500 text-sm">暂无其他文件</div>
            ) : (
              <div className="space-y-3">
                {nonScreenshots.map((item, index) => (
                  <div key={index} className="border rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{getTypeIcon(item.type)}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{item.filename}</span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(item.type)}`}>
                            {item.type.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          <div>大小: {formatFileSize(item.size)}</div>
                          <div>创建时间: {new Date(item.createdAt).toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.type === 'trace' && (
                        <Button
                          onClick={() => handleViewTrace(item.filename)}
                          size="sm"
                          variant="outline"
                        >
                          在线查看
                        </Button>
                      )}
                      <Button
                        onClick={() => handleDownload(item.filename)}
                        disabled={downloading === item.filename}
                        size="sm"
                      >
                        {downloading === item.filename ? '下载中...' : '下载'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {previewUrl && previewIndex != null && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="relative max-w-6xl w-full">
            <div className="absolute top-2 right-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={closePreview}>关闭</Button>
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" variant="outline" onClick={showPrev}>上一张</Button>
              <div className="flex-1">
                <img src={previewUrl} alt="screenshot" className="w-full h-[70vh] object-contain rounded-lg bg-black" />
              </div>
              <Button size="sm" variant="outline" onClick={showNext}>下一张</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};