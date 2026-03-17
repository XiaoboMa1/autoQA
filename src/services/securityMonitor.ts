/**
 * 前端安全监控服务
 * 负责监控用户行为、检测异常操作、记录安全事件
 */

export interface SecurityEvent {
  event_type: string;
  user_id?: string;
  session_id: string;
  timestamp: Date;
  details: Record<string, any>;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  source: 'frontend' | 'backend' | 'system';
  ip_address?: string;
  user_agent?: string;
}

export interface UserAction {
  action: string;
  resource: string;
  resource_id?: string | number;
  timestamp: Date;
  success: boolean;
  error_message?: string;
  metadata?: Record<string, any>;
}

export interface SuspiciousActivity {
  pattern_type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  evidence: any[];
  detected_at: Date;
  user_id?: string;
  session_id: string;
}

class SecurityMonitoringService {
  private sessionId: string;
  private userId?: string;
  private activityBuffer: UserAction[] = [];
  private securityEvents: SecurityEvent[] = [];
  private suspiciousPatterns: Map<string, number> = new Map();
  private isInitialized: boolean = false;

  // 异常活动检测阈值
  private readonly thresholds = {
    MAX_ACTIONS_PER_MINUTE: 100,
    MAX_FAILED_ATTEMPTS: 5,
    RAPID_FIRE_INTERVAL: 1000, // 1秒内多次操作
    BULK_OPERATION_THRESHOLD: 50
  };

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initialize();
  }

  /**
   * 初始化监控服务
   */
  private initialize(): void {
    if (this.isInitialized) return;

    try {
      // 获取用户信息（实际项目中从认证状态获取）
      this.userId = this.getCurrentUserId();
      
      // 开始会话监控
      this.logSecurityEvent('SESSION_START', {
        user_agent: navigator.userAgent,
        screen_resolution: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language
      }, 'low');

      // 设置定期检查
      this.setupPeriodicChecks();
      
      // 设置错误监控
      this.setupErrorMonitoring();
      
      // 设置页面可见性监控
      this.setupVisibilityMonitoring();
      
      this.isInitialized = true;
      console.log('✅ [SecurityMonitor] 安全监控服务已初始化');

    } catch (error) {
      console.error('❌ [SecurityMonitor] 初始化失败:', error);
    }
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  /**
   * 获取当前用户ID（模拟）
   */
  private getCurrentUserId(): string {
    // 实际项目中从认证状态获取
    return localStorage.getItem('current_user_id') || '1';
  }

  /**
   * 记录用户操作
   */
  logUserAction(
    action: string, 
    resource: string, 
    resourceId?: string | number,
    success: boolean = true,
    errorMessage?: string,
    metadata?: Record<string, any>
  ): void {
    const userAction: UserAction = {
      action,
      resource,
      resource_id: resourceId,
      timestamp: new Date(),
      success,
      error_message: errorMessage,
      metadata: {
        ...metadata,
        session_id: this.sessionId,
        user_id: this.userId
      }
    };

    this.activityBuffer.push(userAction);
    
    // 检测可疑活动
    this.detectSuspiciousActivity(userAction);
    
    // 如果是关键操作，立即记录安全事件
    if (this.isCriticalAction(action)) {
      this.logSecurityEvent('CRITICAL_ACTION', {
        action,
        resource,
        resource_id: resourceId,
        success,
        error_message: errorMessage
      }, success ? 'medium' : 'high');
    }

    console.log(`📋 [SecurityMonitor] 用户操作记录:`, userAction);
  }

  /**
   * 记录安全事件
   */
  logSecurityEvent(
    eventType: string,
    details: Record<string, any>,
    riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'
  ): void {
    const securityEvent: SecurityEvent = {
      event_type: eventType,
      user_id: this.userId,
      session_id: this.sessionId,
      timestamp: new Date(),
      details: {
        ...details,
        url: window.location.href,
        referrer: document.referrer
      },
      risk_level: riskLevel,
      source: 'frontend',
      user_agent: navigator.userAgent
    };

    this.securityEvents.push(securityEvent);
    
    console.log(`🔒 [SecurityMonitor] 安全事件:`, securityEvent);

    // 高风险事件立即上报
    if (riskLevel === 'high' || riskLevel === 'critical') {
      this.sendSecurityAlert(securityEvent);
    }

    // 异步发送到后端
    this.sendEventToBackend(securityEvent).catch(error => {
      console.warn('⚠️ [SecurityMonitor] 发送安全事件失败:', error);
    });
  }

  /**
   * 检测可疑活动
   */
  private detectSuspiciousActivity(action: UserAction): void {
    const now = Date.now();
    const recentActions = this.activityBuffer.filter(
      a => now - a.timestamp.getTime() < 60000 // 最近1分钟
    );

    // 检测1：频率过高
    if (recentActions.length > this.thresholds.MAX_ACTIONS_PER_MINUTE) {
      this.reportSuspiciousActivity('HIGH_FREQUENCY', 'high', 
        `用户在1分钟内执行了 ${recentActions.length} 次操作`, recentActions);
    }

    // 检测2：连续失败
    const recentFailures = recentActions.filter(a => !a.success);
    if (recentFailures.length >= this.thresholds.MAX_FAILED_ATTEMPTS) {
      this.reportSuspiciousActivity('REPEATED_FAILURES', 'medium',
        `用户连续失败 ${recentFailures.length} 次操作`, recentFailures);
    }

    // 检测3：快速连击
    const rapidActions = recentActions.filter(
      a => now - a.timestamp.getTime() < this.thresholds.RAPID_FIRE_INTERVAL
    );
    if (rapidActions.length > 5) {
      this.reportSuspiciousActivity('RAPID_FIRE', 'medium',
        `用户在1秒内执行了 ${rapidActions.length} 次操作`, rapidActions);
    }

    // 检测4：批量操作
    if (action.action.includes('bulk') || action.action.includes('batch')) {
      const bulkCount = action.metadata?.count || 1;
      if (bulkCount > this.thresholds.BULK_OPERATION_THRESHOLD) {
        this.reportSuspiciousActivity('LARGE_BULK_OPERATION', 'high',
          `用户执行了大规模批量操作 (${bulkCount} 个项目)`, [action]);
      }
    }

    // 清理旧的活动记录
    this.cleanupActivityBuffer();
  }

  /**
   * 报告可疑活动
   */
  private reportSuspiciousActivity(
    patternType: string,
    severity: 'low' | 'medium' | 'high',
    description: string,
    evidence: any[]
  ): void {
    const activity: SuspiciousActivity = {
      pattern_type: patternType,
      severity,
      description,
      evidence,
      detected_at: new Date(),
      user_id: this.userId,
      session_id: this.sessionId
    };

    console.warn('⚠️ [SecurityMonitor] 检测到可疑活动:', activity);

    // 记录为安全事件
    this.logSecurityEvent('SUSPICIOUS_ACTIVITY', {
      pattern_type: patternType,
      severity,
      description,
      evidence_count: evidence.length
    }, severity === 'high' ? 'high' : 'medium');

    // 更新可疑模式计数
    const currentCount = this.suspiciousPatterns.get(patternType) || 0;
    this.suspiciousPatterns.set(patternType, currentCount + 1);
  }

  /**
   * 发送安全警报
   */
  private async sendSecurityAlert(event: SecurityEvent): Promise<void> {
    try {
      // 在生产环境中，这里应该发送到安全团队的监控系统
      console.error('🚨 [SecurityMonitor] 高风险安全事件:', event);
      
      // 可以集成到Slack、邮件或其他报警系统
      if (event.risk_level === 'critical') {
        // 立即通知
        console.error('🚨🚨 [SecurityMonitor] 严重安全事件需要立即处理!');
      }

    } catch (error) {
      console.error('❌ [SecurityMonitor] 发送安全警报失败:', error);
    }
  }

  /**
   * 发送事件到后端
   */
  private async sendEventToBackend(event: SecurityEvent): Promise<void> {
    try {
      const response = await fetch('/api/v1/security/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': this.userId || '1',
          'x-session-id': this.sessionId
        },
        body: JSON.stringify(event)
      });

      if (!response.ok) {
        console.warn('⚠️ [SecurityMonitor] 后端事件记录失败:', response.status);
      }

    } catch (error) {
      // 不阻止主要功能，静默失败
      console.debug('🔇 [SecurityMonitor] 后端连接失败:', error);
    }
  }

  /**
   * 判断是否为关键操作
   */
  private isCriticalAction(action: string): boolean {
    const criticalActions = [
      'ai_bulk_update',
      'bulk_delete',
      'export_data',
      'change_permissions',
      'create_admin_user',
      'modify_system_settings'
    ];

    return criticalActions.some(critical => 
      action.toLowerCase().includes(critical.toLowerCase())
    );
  }

  /**
   * 清理活动缓冲区
   */
  private cleanupActivityBuffer(): void {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    this.activityBuffer = this.activityBuffer.filter(
      action => action.timestamp.getTime() > fiveMinutesAgo
    );
  }

  /**
   * 设置定期检查
   */
  private setupPeriodicChecks(): void {
    // 每5分钟检查一次
    setInterval(() => {
      this.cleanupActivityBuffer();
      this.checkSystemHealth();
    }, 5 * 60 * 1000);

    // 每30分钟发送活动摘要
    setInterval(() => {
      this.sendActivitySummary();
    }, 30 * 60 * 1000);
  }

  /**
   * 设置错误监控
   */
  private setupErrorMonitoring(): void {
    window.addEventListener('error', (event) => {
      this.logSecurityEvent('JAVASCRIPT_ERROR', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack
      }, 'low');
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.logSecurityEvent('UNHANDLED_PROMISE_REJECTION', {
        reason: event.reason?.toString(),
        stack: event.reason?.stack
      }, 'medium');
    });
  }

  /**
   * 设置页面可见性监控
   */
  private setupVisibilityMonitoring(): void {
    document.addEventListener('visibilitychange', () => {
      this.logSecurityEvent('VISIBILITY_CHANGE', {
        visible: !document.hidden,
        timestamp: new Date().toISOString()
      }, 'low');
    });
  }

  /**
   * 检查系统健康状况
   */
  private checkSystemHealth(): void {
    const memoryInfo = (performance as any).memory;
    const connectionInfo = (navigator as any).connection;

    this.logSecurityEvent('SYSTEM_HEALTH_CHECK', {
      memory_used: memoryInfo?.usedJSHeapSize,
      memory_total: memoryInfo?.totalJSHeapSize,
      connection_type: connectionInfo?.effectiveType,
      online: navigator.onLine,
      active_sessions: 1,
      suspicious_patterns: Object.fromEntries(this.suspiciousPatterns),
      activity_buffer_size: this.activityBuffer.length
    }, 'low');
  }

  /**
   * 发送活动摘要
   */
  private async sendActivitySummary(): Promise<void> {
    const summary = {
      session_id: this.sessionId,
      user_id: this.userId,
      time_range: {
        start: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        end: new Date().toISOString()
      },
      total_actions: this.activityBuffer.length,
      failed_actions: this.activityBuffer.filter(a => !a.success).length,
      security_events: this.securityEvents.length,
      suspicious_activities: this.suspiciousPatterns.size,
      most_frequent_actions: this.getMostFrequentActions()
    };

    console.log('📊 [SecurityMonitor] 活动摘要:', summary);

    try {
      await fetch('/api/v1/security/activity-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': this.userId || '1',
          'x-session-id': this.sessionId
        },
        body: JSON.stringify(summary)
      });
    } catch (error) {
      console.debug('🔇 [SecurityMonitor] 活动摘要发送失败:', error);
    }
  }

  /**
   * 获取最频繁的操作
   */
  private getMostFrequentActions(): Record<string, number> {
    const actionCounts: Record<string, number> = {};
    
    this.activityBuffer.forEach(action => {
      actionCounts[action.action] = (actionCounts[action.action] || 0) + 1;
    });

    // 排序并返回前5个
    return Object.fromEntries(
      Object.entries(actionCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
    );
  }

  /**
   * 获取当前会话统计
   */
  getSessionStats(): any {
    return {
      session_id: this.sessionId,
      user_id: this.userId,
      start_time: this.securityEvents.find(e => e.event_type === 'SESSION_START')?.timestamp,
      total_actions: this.activityBuffer.length,
      security_events: this.securityEvents.length,
      suspicious_patterns: Object.fromEntries(this.suspiciousPatterns),
      is_active: true
    };
  }

  /**
   * 手动触发安全检查
   */
  performSecurityCheck(): void {
    console.log('🔍 [SecurityMonitor] 执行手动安全检查...');
    
    this.checkSystemHealth();
    
    // 检查是否有异常模式
    if (this.suspiciousPatterns.size > 0) {
      this.logSecurityEvent('MANUAL_SECURITY_CHECK', {
        suspicious_patterns_detected: this.suspiciousPatterns.size,
        patterns: Object.fromEntries(this.suspiciousPatterns)
      }, 'medium');
    }
    
    console.log('✅ [SecurityMonitor] 安全检查完成');
  }

  /**
   * 清理并结束会话
   */
  endSession(): void {
    this.logSecurityEvent('SESSION_END', {
      duration: Date.now() - (this.securityEvents[0]?.timestamp.getTime() || Date.now()),
      total_actions: this.activityBuffer.length,
      security_events: this.securityEvents.length
    }, 'low');

    // 清理数据
    this.activityBuffer = [];
    this.securityEvents = [];
    this.suspiciousPatterns.clear();
    
    console.log('🔒 [SecurityMonitor] 会话已结束');
  }
}

// 创建全局实例
export const securityMonitor = new SecurityMonitoringService();

// 为AI批量更新操作添加专门的监控方法
export const monitorAIBulkUpdate = {
  startDryRun: (params: any) => {
    securityMonitor.logUserAction('ai_bulk_update_dry_run', 'test_cases', undefined, true, undefined, {
      system: params.system,
      module: params.module,
      change_brief_length: params.changeBrief?.length,
      filter_count: (params.tagFilter?.length || 0) + (params.priorityFilter ? 1 : 0)
    });
  },

  completeDryRun: (sessionId: number, proposalCount: number, success: boolean, error?: string) => {
    securityMonitor.logUserAction('ai_bulk_update_dry_run_complete', 'ai_session', sessionId, success, error, {
      proposal_count: proposalCount
    });
  },

  selectProposal: (sessionId: number, proposalId: number) => {
    securityMonitor.logUserAction('ai_bulk_update_select_proposal', 'ai_proposal', proposalId, true, undefined, {
      session_id: sessionId
    });
  },

  applyProposals: (sessionId: number, proposalIds: number[]) => {
    securityMonitor.logUserAction('ai_bulk_update_apply', 'ai_session', sessionId, true, undefined, {
      proposal_count: proposalIds.length,
      proposal_ids: proposalIds
    });
  },

  completeApply: (sessionId: number, appliedCount: number, failedCount: number, success: boolean, error?: string) => {
    securityMonitor.logUserAction('ai_bulk_update_apply_complete', 'ai_session', sessionId, success, error, {
      applied_count: appliedCount,
      failed_count: failedCount,
      total_count: appliedCount + failedCount
    });
  }
};