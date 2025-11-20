export interface TestSuite {
  id: number;
  name: string;
  description?: string;
  owner?: string;
  tags?: string[];
  testCaseIds: number[];
  createdAt: string;
  updatedAt: string;
  environment?: string;
  priority?: 'high' | 'medium' | 'low';
  status?: 'active' | 'draft' | 'disabled';
}

export type TestSuiteRunStatus = 'queued' | 'starting' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TestSuiteRun {
  id: string;
  suiteId: number;
  suiteName: string;
  status: TestSuiteRunStatus;
  progress: number;
  startTime: Date;
  endTime?: Date;
  duration: string;
  totalCases: number;
  completedCases: number;
  passedCases: number;
  failedCases: number;
  executor: string;
  environment: string;
  testRuns: string[]; // runIds of individual test cases
  error?: string;
}

export interface SuiteExecutionOptions {
  environment?: string;
  executionMode?: 'standard' | 'interactive';
  concurrency?: number;
  continueOnFailure?: boolean;
} 