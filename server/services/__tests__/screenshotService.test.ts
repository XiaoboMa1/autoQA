import { ScreenshotService } from '../screenshotService';
import { PrismaClient } from '../../../src/generated/prisma';
import { ScreenshotRecord } from '../../types/screenshot';

// Mock PrismaClient
jest.mock('../../../src/generated/prisma', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $disconnect: jest.fn(),
  })),
}));

describe('ScreenshotService', () => {
  let screenshotService: ScreenshotService;
  let mockPrisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    screenshotService = new ScreenshotService(mockPrisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create instance with provided Prisma client', () => {
      const service = new ScreenshotService(mockPrisma);
      expect(service).toBeInstanceOf(ScreenshotService);
    });

    it('should create instance with default Prisma client when none provided', () => {
      const service = new ScreenshotService();
      expect(service).toBeInstanceOf(ScreenshotService);
    });
  });

  describe('Method signatures', () => {
    it('should have saveScreenshot method', () => {
      expect(typeof screenshotService.saveScreenshot).toBe('function');
    });

    it('should have getScreenshotsByRunId method', () => {
      expect(typeof screenshotService.getScreenshotsByRunId).toBe('function');
    });

    it('should have getStepScreenshot method', () => {
      expect(typeof screenshotService.getStepScreenshot).toBe('function');
    });

    it('should have verifyScreenshotFile method', () => {
      expect(typeof screenshotService.verifyScreenshotFile).toBe('function');
    });

    it('should have cleanupExpiredScreenshots method', () => {
      expect(typeof screenshotService.cleanupExpiredScreenshots).toBe('function');
    });

    it('should have getStorageStats method', () => {
      expect(typeof screenshotService.getStorageStats).toBe('function');
    });

    it('should have disconnect method', () => {
      expect(typeof screenshotService.disconnect).toBe('function');
    });
  });

  describe('saveScreenshot', () => {
    const mockStepScreenshots = {
      create: jest.fn(),
    };

    beforeEach(() => {
      (mockPrisma as any).step_screenshots = mockStepScreenshots;
      jest.spyOn(require('fs').promises, 'stat').mockImplementation(() => 
        Promise.resolve({ size: 1024 })
      );
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should save screenshot record successfully', async () => {
      const inputRecord: ScreenshotRecord = {
        runId: 'test-run-1',
        stepIndex: 1,
        status: 'success',
        filePath: 'screenshots/test.png',
        fileName: 'test.png',
        testCaseId: 123,
        stepDescription: 'Test step description'
      };

      const mockSavedRecord = {
        id: 1,
        run_id: 'test-run-1',
        test_case_id: 123,
        step_index: '1',
        step_description: 'Test step description',
        status: 'success',
        file_path: 'screenshots/test.png',
        file_name: 'test.png',
        file_size: BigInt(1024),
        mime_type: 'image/png',
        created_at: new Date('2024-01-01T00:00:00Z'),
        file_exists: true,
      };

      mockStepScreenshots.create.mockResolvedValue(mockSavedRecord);

      const result = await screenshotService.saveScreenshot(inputRecord);

      expect(mockStepScreenshots.create).toHaveBeenCalledWith({
        data: {
          run_id: 'test-run-1',
          test_case_id: 123,
          step_index: '1',
          step_description: 'Test step description',
          status: 'success',
          file_path: 'screenshots/test.png',
          file_name: 'test.png',
          file_size: BigInt(1024),
          mime_type: 'image/png',
          file_exists: true,
        },
      });

      expect(result).toEqual({
        id: 1,
        runId: 'test-run-1',
        testCaseId: 123,
        stepIndex: '1',
        stepDescription: 'Test step description',
        status: 'success',
        filePath: 'screenshots/test.png',
        fileName: 'test.png',
        fileSize: 1024,
        mimeType: 'image/png',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        fileExists: true,
      });
    });

    it('should save screenshot with minimal required fields', async () => {
      const inputRecord: ScreenshotRecord = {
        runId: 'test-run-2',
        stepIndex: 'final',
        status: 'failed',
        filePath: 'screenshots/test2.png',
        fileName: 'test2.png'
      };

      const mockSavedRecord = {
        id: 2,
        run_id: 'test-run-2',
        test_case_id: null,
        step_index: 'final',
        step_description: null,
        status: 'failed',
        file_path: 'screenshots/test2.png',
        file_name: 'test2.png',
        file_size: BigInt(1024),
        mime_type: 'image/png',
        created_at: new Date('2024-01-01T00:00:00Z'),
        file_exists: true,
      };

      mockStepScreenshots.create.mockResolvedValue(mockSavedRecord);

      const result = await screenshotService.saveScreenshot(inputRecord);

      expect(mockStepScreenshots.create).toHaveBeenCalledWith({
        data: {
          run_id: 'test-run-2',
          test_case_id: null,
          step_index: 'final',
          step_description: null,
          status: 'failed',
          file_path: 'screenshots/test2.png',
          file_name: 'test2.png',
          file_size: BigInt(1024),
          mime_type: 'image/png',
          file_exists: true,
        },
      });

      expect(result.testCaseId).toBeUndefined();
      expect(result.stepDescription).toBeUndefined();
    });

    it('should handle file size retrieval failure gracefully', async () => {
      jest.spyOn(require('fs').promises, 'stat').mockRejectedValue(new Error('File not found'));

      const inputRecord: ScreenshotRecord = {
        runId: 'test-run-3',
        stepIndex: 1,
        status: 'error',
        filePath: 'screenshots/missing.png',
        fileName: 'missing.png'
      };

      const mockSavedRecord = {
        id: 3,
        run_id: 'test-run-3',
        test_case_id: null,
        step_index: '1',
        step_description: null,
        status: 'error',
        file_path: 'screenshots/missing.png',
        file_name: 'missing.png',
        file_size: BigInt(0),
        mime_type: 'image/png',
        created_at: new Date('2024-01-01T00:00:00Z'),
        file_exists: true,
      };

      mockStepScreenshots.create.mockResolvedValue(mockSavedRecord);

      const result = await screenshotService.saveScreenshot(inputRecord);

      expect(result.fileSize).toBe(0);
    });

    it('should throw error when runId is missing', async () => {
      const inputRecord: ScreenshotRecord = {
        runId: '',
        stepIndex: 1,
        status: 'success',
        filePath: 'screenshots/test.png',
        fileName: 'test.png'
      };

      await expect(screenshotService.saveScreenshot(inputRecord))
        .rejects.toThrow('保存截图记录失败: runId is required');
    });

    it('should throw error when filePath is missing', async () => {
      const inputRecord: ScreenshotRecord = {
        runId: 'test-run-1',
        stepIndex: 1,
        status: 'success',
        filePath: '',
        fileName: 'test.png'
      };

      await expect(screenshotService.saveScreenshot(inputRecord))
        .rejects.toThrow('保存截图记录失败: filePath is required');
    });

    it('should throw error when fileName is missing', async () => {
      const inputRecord: ScreenshotRecord = {
        runId: 'test-run-1',
        stepIndex: 1,
        status: 'success',
        filePath: 'screenshots/test.png',
        fileName: ''
      };

      await expect(screenshotService.saveScreenshot(inputRecord))
        .rejects.toThrow('保存截图记录失败: fileName is required');
    });

    it('should throw error when status is missing', async () => {
      const inputRecord: ScreenshotRecord = {
        runId: 'test-run-1',
        stepIndex: 1,
        status: '' as any,
        filePath: 'screenshots/test.png',
        fileName: 'test.png'
      };

      await expect(screenshotService.saveScreenshot(inputRecord))
        .rejects.toThrow('保存截图记录失败: status is required');
    });

    it('should handle database errors gracefully', async () => {
      const inputRecord: ScreenshotRecord = {
        runId: 'test-run-1',
        stepIndex: 1,
        status: 'success',
        filePath: 'screenshots/test.png',
        fileName: 'test.png'
      };

      mockStepScreenshots.create.mockRejectedValue(new Error('Database connection failed'));

      await expect(screenshotService.saveScreenshot(inputRecord))
        .rejects.toThrow('保存截图记录失败: Database connection failed');
    });

    it('should use provided fileSize when available', async () => {
      const inputRecord: ScreenshotRecord = {
        runId: 'test-run-1',
        stepIndex: 1,
        status: 'success',
        filePath: 'screenshots/test.png',
        fileName: 'test.png',
        fileSize: 2048
      };

      const mockSavedRecord = {
        id: 1,
        run_id: 'test-run-1',
        test_case_id: null,
        step_index: '1',
        step_description: null,
        status: 'success',
        file_path: 'screenshots/test.png',
        file_name: 'test.png',
        file_size: BigInt(2048),
        mime_type: 'image/png',
        created_at: new Date('2024-01-01T00:00:00Z'),
        file_exists: true,
      };

      mockStepScreenshots.create.mockResolvedValue(mockSavedRecord);

      const result = await screenshotService.saveScreenshot(inputRecord);

      expect(mockStepScreenshots.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          file_size: BigInt(2048),
        }),
      });

      expect(result.fileSize).toBe(2048);
    });
  });

  describe('getScreenshotsByRunId', () => {
    const mockStepScreenshots = {
      findMany: jest.fn(),
    };

    beforeEach(() => {
      (mockPrisma as any).step_screenshots = mockStepScreenshots;
    });

    it('should get screenshots by run ID with default sorting', async () => {
      const mockScreenshots = [
        {
          id: 1,
          run_id: 'test-run-1',
          test_case_id: 123,
          step_index: '1',
          step_description: 'First step',
          status: 'success',
          file_path: 'screenshots/step1.png',
          file_name: 'step1.png',
          file_size: BigInt(1024),
          mime_type: 'image/png',
          created_at: new Date('2024-01-01T00:00:00Z'),
          file_exists: true,
        },
        {
          id: 2,
          run_id: 'test-run-1',
          test_case_id: 123,
          step_index: '2',
          step_description: 'Second step',
          status: 'failed',
          file_path: 'screenshots/step2.png',
          file_name: 'step2.png',
          file_size: BigInt(2048),
          mime_type: 'image/png',
          created_at: new Date('2024-01-01T00:01:00Z'),
          file_exists: true,
        },
      ];

      mockStepScreenshots.findMany.mockResolvedValue(mockScreenshots);

      const result = await screenshotService.getScreenshotsByRunId('test-run-1');

      expect(mockStepScreenshots.findMany).toHaveBeenCalledWith({
        where: { run_id: 'test-run-1' },
        orderBy: [
          { step_index: 'asc' },
          { created_at: 'asc' }
        ],
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 1,
        runId: 'test-run-1',
        testCaseId: 123,
        stepIndex: '1',
        stepDescription: 'First step',
        status: 'success',
        filePath: 'screenshots/step1.png',
        fileName: 'step1.png',
        fileSize: 1024,
        mimeType: 'image/png',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        fileExists: true,
      });
    });

    it('should get screenshots with custom sorting by created_at desc', async () => {
      const mockScreenshots = [
        {
          id: 2,
          run_id: 'test-run-1',
          test_case_id: null,
          step_index: '2',
          step_description: null,
          status: 'success',
          file_path: 'screenshots/step2.png',
          file_name: 'step2.png',
          file_size: null,
          mime_type: 'image/png',
          created_at: new Date('2024-01-01T00:01:00Z'),
          file_exists: true,
        },
      ];

      mockStepScreenshots.findMany.mockResolvedValue(mockScreenshots);

      const result = await screenshotService.getScreenshotsByRunId('test-run-1', {
        orderBy: 'created_at',
        orderDirection: 'desc'
      });

      expect(mockStepScreenshots.findMany).toHaveBeenCalledWith({
        where: { run_id: 'test-run-1' },
        orderBy: { created_at: 'desc' },
      });

      expect(result[0].testCaseId).toBeUndefined();
      expect(result[0].stepDescription).toBeUndefined();
      expect(result[0].fileSize).toBeUndefined();
    });

    it('should get screenshots with pagination', async () => {
      const mockScreenshots = [
        {
          id: 3,
          run_id: 'test-run-1',
          test_case_id: 123,
          step_index: '3',
          step_description: 'Third step',
          status: 'completed',
          file_path: 'screenshots/step3.png',
          file_name: 'step3.png',
          file_size: BigInt(3072),
          mime_type: 'image/png',
          created_at: new Date('2024-01-01T00:02:00Z'),
          file_exists: false,
        },
      ];

      mockStepScreenshots.findMany.mockResolvedValue(mockScreenshots);

      const result = await screenshotService.getScreenshotsByRunId('test-run-1', {
        limit: 10,
        offset: 5
      });

      expect(mockStepScreenshots.findMany).toHaveBeenCalledWith({
        where: { run_id: 'test-run-1' },
        orderBy: [
          { step_index: 'asc' },
          { created_at: 'asc' }
        ],
        take: 10,
        skip: 5,
      });

      expect(result[0].fileExists).toBe(false);
    });

    it('should handle step index sorting correctly for mixed numeric and string values', async () => {
      const mockScreenshots = [
        {
          id: 1,
          run_id: 'test-run-1',
          test_case_id: 123,
          step_index: '10',
          step_description: 'Step 10',
          status: 'success',
          file_path: 'screenshots/step10.png',
          file_name: 'step10.png',
          file_size: BigInt(1024),
          mime_type: 'image/png',
          created_at: new Date('2024-01-01T00:00:00Z'),
          file_exists: true,
        },
        {
          id: 2,
          run_id: 'test-run-1',
          test_case_id: 123,
          step_index: '2',
          step_description: 'Step 2',
          status: 'success',
          file_path: 'screenshots/step2.png',
          file_name: 'step2.png',
          file_size: BigInt(1024),
          mime_type: 'image/png',
          created_at: new Date('2024-01-01T00:01:00Z'),
          file_exists: true,
        },
        {
          id: 3,
          run_id: 'test-run-1',
          test_case_id: 123,
          step_index: 'final',
          step_description: 'Final step',
          status: 'success',
          file_path: 'screenshots/final.png',
          file_name: 'final.png',
          file_size: BigInt(1024),
          mime_type: 'image/png',
          created_at: new Date('2024-01-01T00:02:00Z'),
          file_exists: true,
        },
      ];

      mockStepScreenshots.findMany.mockResolvedValue(mockScreenshots);

      const result = await screenshotService.getScreenshotsByRunId('test-run-1');

      // Should be sorted as: 2, 10, final
      expect(result[0].stepIndex).toBe('2');
      expect(result[1].stepIndex).toBe('10');
      expect(result[2].stepIndex).toBe('final');
    });

    it('should throw error when runId is empty', async () => {
      await expect(screenshotService.getScreenshotsByRunId(''))
        .rejects.toThrow('查询测试运行截图失败: runId is required');
    });

    it('should handle database errors gracefully', async () => {
      mockStepScreenshots.findMany.mockRejectedValue(new Error('Database connection failed'));

      await expect(screenshotService.getScreenshotsByRunId('test-run-1'))
        .rejects.toThrow('查询测试运行截图失败: Database connection failed');
    });

    it('should return empty array when no screenshots found', async () => {
      mockStepScreenshots.findMany.mockResolvedValue([]);

      const result = await screenshotService.getScreenshotsByRunId('nonexistent-run');

      expect(result).toEqual([]);
    });
  });

  describe('getStepScreenshot', () => {
    const mockStepScreenshots = {
      findFirst: jest.fn(),
    };

    beforeEach(() => {
      (mockPrisma as any).step_screenshots = mockStepScreenshots;
    });

    it('should get specific step screenshot', async () => {
      const mockScreenshot = {
        id: 1,
        run_id: 'test-run-1',
        test_case_id: 123,
        step_index: '1',
        step_description: 'First step',
        status: 'success',
        file_path: 'screenshots/step1.png',
        file_name: 'step1.png',
        file_size: BigInt(1024),
        mime_type: 'image/png',
        created_at: new Date('2024-01-01T00:00:00Z'),
        file_exists: true,
      };

      mockStepScreenshots.findFirst.mockResolvedValue(mockScreenshot);

      const result = await screenshotService.getStepScreenshot('test-run-1', 1);

      expect(mockStepScreenshots.findFirst).toHaveBeenCalledWith({
        where: {
          run_id: 'test-run-1',
          step_index: '1',
        },
        orderBy: {
          created_at: 'desc',
        },
      });

      expect(result).toEqual({
        id: 1,
        runId: 'test-run-1',
        testCaseId: 123,
        stepIndex: '1',
        stepDescription: 'First step',
        status: 'success',
        filePath: 'screenshots/step1.png',
        fileName: 'step1.png',
        fileSize: 1024,
        mimeType: 'image/png',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        fileExists: true,
      });
    });

    it('should get step screenshot with string step index', async () => {
      const mockScreenshot = {
        id: 2,
        run_id: 'test-run-1',
        test_case_id: null,
        step_index: 'final',
        step_description: null,
        status: 'completed',
        file_path: 'screenshots/final.png',
        file_name: 'final.png',
        file_size: null,
        mime_type: 'image/png',
        created_at: new Date('2024-01-01T00:00:00Z'),
        file_exists: true,
      };

      mockStepScreenshots.findFirst.mockResolvedValue(mockScreenshot);

      const result = await screenshotService.getStepScreenshot('test-run-1', 'final');

      expect(mockStepScreenshots.findFirst).toHaveBeenCalledWith({
        where: {
          run_id: 'test-run-1',
          step_index: 'final',
        },
        orderBy: {
          created_at: 'desc',
        },
      });

      expect(result?.testCaseId).toBeUndefined();
      expect(result?.stepDescription).toBeUndefined();
      expect(result?.fileSize).toBeUndefined();
    });

    it('should return null when screenshot not found', async () => {
      mockStepScreenshots.findFirst.mockResolvedValue(null);

      const result = await screenshotService.getStepScreenshot('test-run-1', 999);

      expect(result).toBeNull();
    });

    it('should throw error when runId is empty', async () => {
      await expect(screenshotService.getStepScreenshot('', 1))
        .rejects.toThrow('查询特定步骤截图失败: runId is required');
    });

    it('should throw error when stepIndex is null', async () => {
      await expect(screenshotService.getStepScreenshot('test-run-1', null as any))
        .rejects.toThrow('查询特定步骤截图失败: stepIndex is required');
    });

    it('should throw error when stepIndex is undefined', async () => {
      await expect(screenshotService.getStepScreenshot('test-run-1', undefined as any))
        .rejects.toThrow('查询特定步骤截图失败: stepIndex is required');
    });

    it('should handle database errors gracefully', async () => {
      mockStepScreenshots.findFirst.mockRejectedValue(new Error('Database connection failed'));

      await expect(screenshotService.getStepScreenshot('test-run-1', 1))
        .rejects.toThrow('查询特定步骤截图失败: Database connection failed');
    });
  });

  describe('verifyScreenshotFile', () => {
    const mockStepScreenshots = {
      findUnique: jest.fn(),
      update: jest.fn(),
    };

    beforeEach(() => {
      (mockPrisma as any).step_screenshots = mockStepScreenshots;
      jest.spyOn(require('fs').promises, 'access').mockImplementation(() => Promise.resolve());
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should verify existing file and return true', async () => {
      const mockScreenshot = {
        id: 1,
        file_path: 'screenshots/test.png',
        file_name: 'test.png',
        file_exists: true,
      };

      mockStepScreenshots.findUnique.mockResolvedValue(mockScreenshot);

      const result = await screenshotService.verifyScreenshotFile(1);

      expect(mockStepScreenshots.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(require('fs').promises.access).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should verify missing file and update database status', async () => {
      const mockScreenshot = {
        id: 1,
        file_path: 'screenshots/missing.png',
        file_name: 'missing.png',
        file_exists: true,
      };

      mockStepScreenshots.findUnique.mockResolvedValue(mockScreenshot);
      jest.spyOn(require('fs').promises, 'access').mockRejectedValue(new Error('File not found'));

      const result = await screenshotService.verifyScreenshotFile(1);

      expect(mockStepScreenshots.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { file_exists: false },
      });
      expect(result).toBe(false);
    });

    it('should not update database if file_exists status is already correct', async () => {
      const mockScreenshot = {
        id: 1,
        file_path: 'screenshots/test.png',
        file_name: 'test.png',
        file_exists: true,
      };

      mockStepScreenshots.findUnique.mockResolvedValue(mockScreenshot);

      await screenshotService.verifyScreenshotFile(1);

      expect(mockStepScreenshots.update).not.toHaveBeenCalled();
    });

    it('should throw error when screenshotId is invalid', async () => {
      await expect(screenshotService.verifyScreenshotFile(0))
        .rejects.toThrow('验证截图文件失败: screenshotId is required');
    });

    it('should return false when screenshot record not found', async () => {
      mockStepScreenshots.findUnique.mockResolvedValue(null);

      const result = await screenshotService.verifyScreenshotFile(999);

      expect(result).toBe(false);
    });
  });

  describe('verifyScreenshotFiles', () => {
    const mockStepScreenshots = {
      findMany: jest.fn(),
      update: jest.fn(),
    };

    beforeEach(() => {
      (mockPrisma as any).step_screenshots = mockStepScreenshots;
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should verify all screenshots when no IDs provided', async () => {
      const mockScreenshots = [
        { id: 1, file_path: 'screenshots/test1.png', file_name: 'test1.png', file_exists: true },
        { id: 2, file_path: 'screenshots/test2.png', file_name: 'test2.png', file_exists: true },
      ];

      mockStepScreenshots.findMany.mockResolvedValue(mockScreenshots);
      jest.spyOn(require('fs').promises, 'access')
        .mockResolvedValueOnce(undefined) // First file exists
        .mockRejectedValueOnce(new Error('File not found')); // Second file missing

      const result = await screenshotService.verifyScreenshotFiles();

      expect(mockStepScreenshots.findMany).toHaveBeenCalledWith({
        select: { id: true, file_path: true, file_name: true, file_exists: true },
      });
      expect(result).toEqual({
        total: 2,
        existing: 1,
        missing: 1,
        errors: 0,
      });
    });

    it('should verify specific screenshots when IDs provided', async () => {
      const mockScreenshots = [
        { id: 1, file_path: 'screenshots/test1.png', file_name: 'test1.png', file_exists: true },
      ];

      mockStepScreenshots.findMany.mockResolvedValue(mockScreenshots);
      jest.spyOn(require('fs').promises, 'access').mockResolvedValue(undefined);

      const result = await screenshotService.verifyScreenshotFiles([1]);

      expect(mockStepScreenshots.findMany).toHaveBeenCalledWith({
        where: { id: { in: [1] } },
        select: { id: true, file_path: true, file_name: true, file_exists: true },
      });
      expect(result.total).toBe(1);
      expect(result.existing).toBe(1);
    });

    it('should handle batch processing correctly', async () => {
      const mockScreenshots = Array.from({ length: 150 }, (_, i) => ({
        id: i + 1,
        file_path: `screenshots/test${i + 1}.png`,
        file_name: `test${i + 1}.png`,
        file_exists: true,
      }));

      mockStepScreenshots.findMany.mockResolvedValue(mockScreenshots);
      jest.spyOn(require('fs').promises, 'access').mockResolvedValue(undefined);

      const result = await screenshotService.verifyScreenshotFiles(undefined, 50);

      expect(result.total).toBe(150);
      expect(result.existing).toBe(150);
    });
  });

  describe('cleanupExpiredScreenshots', () => {
    const mockStepScreenshots = {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    };

    beforeEach(() => {
      (mockPrisma as any).step_screenshots = mockStepScreenshots;
      jest.spyOn(require('fs').promises, 'access').mockResolvedValue(undefined);
      jest.spyOn(require('fs').promises, 'unlink').mockResolvedValue(undefined);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should cleanup expired screenshots successfully', async () => {
      const mockExpiredScreenshots = [
        {
          id: 1,
          file_path: 'screenshots/old1.png',
          file_name: 'old1.png',
          created_at: new Date('2023-01-01'),
        },
        {
          id: 2,
          file_path: 'screenshots/old2.png',
          file_name: 'old2.png',
          created_at: new Date('2023-01-02'),
        },
      ];

      mockStepScreenshots.findMany.mockResolvedValue(mockExpiredScreenshots);
      mockStepScreenshots.deleteMany.mockResolvedValue({ count: 2 });

      const result = await screenshotService.cleanupExpiredScreenshots(30);

      expect(mockStepScreenshots.findMany).toHaveBeenCalledWith({
        where: {
          created_at: {
            lt: expect.any(Date),
          },
        },
        select: {
          id: true,
          file_path: true,
          file_name: true,
          created_at: true,
        },
      });

      expect(require('fs').promises.unlink).toHaveBeenCalledTimes(2);
      expect(mockStepScreenshots.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] } },
      });
      expect(result).toBe(2);
    });

    it('should return 0 when no expired screenshots found', async () => {
      mockStepScreenshots.findMany.mockResolvedValue([]);

      const result = await screenshotService.cleanupExpiredScreenshots(30);

      expect(result).toBe(0);
    });

    it('should handle file deletion errors gracefully', async () => {
      const mockExpiredScreenshots = [
        {
          id: 1,
          file_path: 'screenshots/old1.png',
          file_name: 'old1.png',
          created_at: new Date('2023-01-01'),
        },
      ];

      mockStepScreenshots.findMany.mockResolvedValue(mockExpiredScreenshots);
      mockStepScreenshots.deleteMany.mockResolvedValue({ count: 1 });
      jest.spyOn(require('fs').promises, 'unlink').mockRejectedValue(new Error('Permission denied'));

      const result = await screenshotService.cleanupExpiredScreenshots(30);

      expect(result).toBe(1); // Database record still deleted
    });

    it('should throw error for invalid daysToKeep parameter', async () => {
      await expect(screenshotService.cleanupExpiredScreenshots(-1))
        .rejects.toThrow('清理过期截图失败: daysToKeep must be a positive number');

      await expect(screenshotService.cleanupExpiredScreenshots(0))
        .rejects.toThrow('清理过期截图失败: daysToKeep must be a positive number');
    });
  });

  describe('cleanupExpiredScreenshotsWithStats', () => {
    const mockStepScreenshots = {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    };

    beforeEach(() => {
      (mockPrisma as any).step_screenshots = mockStepScreenshots;
      jest.spyOn(require('fs').promises, 'access').mockResolvedValue(undefined);
      jest.spyOn(require('fs').promises, 'unlink').mockResolvedValue(undefined);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return detailed cleanup statistics', async () => {
      const mockExpiredScreenshots = [
        {
          id: 1,
          file_path: 'screenshots/old1.png',
          file_name: 'old1.png',
          created_at: new Date('2023-01-01'),
        },
        {
          id: 2,
          file_path: 'screenshots/old2.png',
          file_name: 'old2.png',
          created_at: new Date('2023-01-02'),
        },
      ];

      mockStepScreenshots.findMany.mockResolvedValue(mockExpiredScreenshots);
      mockStepScreenshots.deleteMany.mockResolvedValue({ count: 2 });

      const result = await screenshotService.cleanupExpiredScreenshotsWithStats(30);

      expect(result).toEqual({
        totalFound: 2,
        filesDeleted: 2,
        filesNotFound: 0,
        fileDeleteErrors: 0,
        recordsDeleted: 2,
        recordDeleteErrors: 0,
      });
    });

    it('should handle mixed file deletion scenarios', async () => {
      const mockExpiredScreenshots = [
        {
          id: 1,
          file_path: 'screenshots/exists.png',
          file_name: 'exists.png',
          created_at: new Date('2023-01-01'),
        },
        {
          id: 2,
          file_path: 'screenshots/missing.png',
          file_name: 'missing.png',
          created_at: new Date('2023-01-02'),
        },
        {
          id: 3,
          file_path: 'screenshots/error.png',
          file_name: 'error.png',
          created_at: new Date('2023-01-03'),
        },
      ];

      mockStepScreenshots.findMany.mockResolvedValue(mockExpiredScreenshots);
      mockStepScreenshots.deleteMany.mockResolvedValue({ count: 3 });

      jest.spyOn(require('fs').promises, 'access')
        .mockResolvedValueOnce(undefined) // First file exists
        .mockRejectedValueOnce(new Error('File not found')) // Second file missing
        .mockResolvedValueOnce(undefined); // Third file exists

      jest.spyOn(require('fs').promises, 'unlink')
        .mockResolvedValueOnce(undefined) // First file deleted successfully
        .mockRejectedValueOnce(new Error('Permission denied')); // Third file deletion fails

      const result = await screenshotService.cleanupExpiredScreenshotsWithStats(30);

      expect(result).toEqual({
        totalFound: 3,
        filesDeleted: 1,
        filesNotFound: 2, // Both second and third files are counted as not found/error
        fileDeleteErrors: 0, // The third file access succeeds but unlink fails, so it's not counted as error here
        recordsDeleted: 3,
        recordDeleteErrors: 0,
      });
    });

    it('should handle database deletion errors', async () => {
      const mockExpiredScreenshots = [
        {
          id: 1,
          file_path: 'screenshots/test.png',
          file_name: 'test.png',
          created_at: new Date('2023-01-01'),
        },
      ];

      mockStepScreenshots.findMany.mockResolvedValue(mockExpiredScreenshots);
      mockStepScreenshots.deleteMany.mockRejectedValue(new Error('Database error'));

      const result = await screenshotService.cleanupExpiredScreenshotsWithStats(30);

      expect(result.recordDeleteErrors).toBe(1);
      expect(result.recordsDeleted).toBe(0);
    });

    it('should respect safety checks for file paths', async () => {
      const service = new ScreenshotService(mockPrisma, { enableSafetyChecks: true, screenshotsDirectory: 'screenshots' });
      
      const mockExpiredScreenshots = [
        {
          id: 1,
          file_path: '/etc/passwd', // Dangerous path outside screenshots directory
          file_name: 'passwd',
          created_at: new Date('2023-01-01'),
        },
      ];

      mockStepScreenshots.findMany.mockResolvedValue(mockExpiredScreenshots);
      mockStepScreenshots.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.cleanupExpiredScreenshotsWithStats(30);

      expect(require('fs').promises.unlink).not.toHaveBeenCalled();
      expect(result.filesDeleted).toBe(0);
      expect(result.recordsDeleted).toBe(1);
    });

    it('should handle batch processing correctly', async () => {
      const service = new ScreenshotService(mockPrisma, { batchSize: 2 });
      
      const mockExpiredScreenshots = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        file_path: `screenshots/test${i + 1}.png`,
        file_name: `test${i + 1}.png`,
        created_at: new Date('2023-01-01'),
      }));

      mockStepScreenshots.findMany.mockResolvedValue(mockExpiredScreenshots);
      mockStepScreenshots.deleteMany
        .mockResolvedValueOnce({ count: 2 })
        .mockResolvedValueOnce({ count: 2 })
        .mockResolvedValueOnce({ count: 1 });

      const result = await service.cleanupExpiredScreenshotsWithStats(30);

      expect(mockStepScreenshots.deleteMany).toHaveBeenCalledTimes(3);
      expect(result.totalFound).toBe(5);
      expect(result.recordsDeleted).toBe(5);
    });

    it('should throw error for invalid daysToKeep parameter', async () => {
      await expect(screenshotService.cleanupExpiredScreenshotsWithStats(-1))
        .rejects.toThrow('清理过期截图失败: daysToKeep must be a positive number');

      await expect(screenshotService.cleanupExpiredScreenshotsWithStats(0))
        .rejects.toThrow('清理过期截图失败: daysToKeep must be a positive number');
    });
  });

  describe('getStorageStats', () => {
    const mockStepScreenshots = {
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    };

    beforeEach(() => {
      (mockPrisma as any).step_screenshots = mockStepScreenshots;
    });

    it('should return empty stats when no screenshots exist', async () => {
      mockStepScreenshots.count.mockResolvedValue(0);

      const result = await screenshotService.getStorageStats();

      expect(result).toEqual({
        totalScreenshots: 0,
        totalSize: 0,
        avgFileSize: 0,
        oldestScreenshot: expect.any(Date),
        newestScreenshot: expect.any(Date),
        missingFiles: 0,
        sizeByStatus: {
          success: 0,
          failed: 0,
          error: 0,
          completed: 0,
        },
        countByStatus: {
          success: 0,
          failed: 0,
          error: 0,
          completed: 0,
        },
        largestFile: null,
        smallestFile: null,
        recentActivity: {
          last24Hours: 0,
          last7Days: 0,
          last30Days: 0,
        },
        storageHealth: {
          healthScore: 100,
          issues: [],
          recommendations: [],
        },
      });
    });

    it('should return comprehensive stats when screenshots exist', async () => {
      const mockDate = new Date('2024-01-01T00:00:00Z');
      
      mockStepScreenshots.count
        .mockResolvedValueOnce(100) // totalScreenshots
        .mockResolvedValueOnce(5); // missingFiles

      mockStepScreenshots.aggregate
        .mockResolvedValueOnce({ // sizeStats
          _sum: { file_size: BigInt(1024000) },
          _avg: { file_size: BigInt(10240) },
        })
        .mockResolvedValueOnce({ // timeStats
          _min: { created_at: new Date('2023-01-01') },
          _max: { created_at: new Date('2024-01-01') },
        });

      mockStepScreenshots.groupBy.mockResolvedValue([
        { status: 'success', _count: { _all: 60 }, _sum: { file_size: BigInt(614400) } },
        { status: 'failed', _count: { _all: 30 }, _sum: { file_size: BigInt(307200) } },
        { status: 'error', _count: { _all: 8 }, _sum: { file_size: BigInt(81920) } },
        { status: 'completed', _count: { _all: 2 }, _sum: { file_size: BigInt(20480) } },
      ]);

      mockStepScreenshots.findMany
        .mockResolvedValueOnce([ // largest file
          { file_name: 'large.png', file_size: BigInt(51200), run_id: 'run-1' }
        ])
        .mockResolvedValueOnce([ // smallest file
          { file_name: 'small.png', file_size: BigInt(1024), run_id: 'run-2' }
        ])
        .mockResolvedValueOnce(10) // last24Hours
        .mockResolvedValueOnce(50) // last7Days
        .mockResolvedValueOnce(80); // last30Days

      const result = await screenshotService.getStorageStats();

      expect(result).toEqual({
        totalScreenshots: 100,
        totalSize: 1024000,
        avgFileSize: 10240,
        oldestScreenshot: new Date('2023-01-01'),
        newestScreenshot: new Date('2024-01-01'),
        missingFiles: 5,
        sizeByStatus: {
          success: 614400,
          failed: 307200,
          error: 81920,
          completed: 20480,
        },
        countByStatus: {
          success: 60,
          failed: 30,
          error: 8,
          completed: 2,
        },
        largestFile: {
          fileName: 'large.png',
          size: 51200,
          runId: 'run-1',
        },
        smallestFile: {
          fileName: 'small.png',
          size: 1024,
          runId: 'run-2',
        },
        recentActivity: {
          last24Hours: 10,
          last7Days: 50,
          last30Days: 80,
        },
        storageHealth: expect.objectContaining({
          healthScore: expect.any(Number),
          issues: expect.any(Array),
          recommendations: expect.any(Array),
        }),
      });
    });

    it('should handle null file sizes gracefully', async () => {
      mockStepScreenshots.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(0);

      mockStepScreenshots.aggregate
        .mockResolvedValueOnce({
          _sum: { file_size: null },
          _avg: { file_size: null },
        })
        .mockResolvedValueOnce({
          _min: { created_at: new Date('2024-01-01') },
          _max: { created_at: new Date('2024-01-01') },
        });

      mockStepScreenshots.groupBy.mockResolvedValue([]);
      mockStepScreenshots.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await screenshotService.getStorageStats();

      expect(result.totalSize).toBe(0);
      expect(result.avgFileSize).toBe(0);
      expect(result.largestFile).toBeNull();
      expect(result.smallestFile).toBeNull();
    });

    it('should calculate storage health correctly', async () => {
      mockStepScreenshots.count
        .mockResolvedValueOnce(100) // totalScreenshots
        .mockResolvedValueOnce(25); // missingFiles (25% missing)

      mockStepScreenshots.aggregate
        .mockResolvedValueOnce({
          _sum: { file_size: BigInt(15 * 1024 * 1024 * 1024) }, // 15GB
          _avg: { file_size: BigInt(10240) },
        })
        .mockResolvedValueOnce({
          _min: { created_at: new Date('2023-01-01') },
          _max: { created_at: new Date('2024-01-01') },
        });

      mockStepScreenshots.groupBy.mockResolvedValue([]);
      mockStepScreenshots.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await screenshotService.getStorageStats();

      expect(result.storageHealth.healthScore).toBeLessThan(100);
      expect(result.storageHealth.issues).toContain(expect.stringContaining('25 个截图文件缺失'));
      expect(result.storageHealth.issues).toContain(expect.stringContaining('存储空间使用较大'));
      expect(result.storageHealth.recommendations).toContain('考虑从备份恢复缺失的截图文件');
      expect(result.storageHealth.recommendations).toContain('考虑清理过期截图以释放存储空间');
    });

    it('should handle database errors gracefully', async () => {
      mockStepScreenshots.count.mockRejectedValue(new Error('Database connection failed'));

      await expect(screenshotService.getStorageStats())
        .rejects.toThrow('获取存储统计失败: Database connection failed');
    });
  });

  describe('Periodic tasks', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe('createPeriodicVerificationTask', () => {
      it('should create periodic verification task with default interval', () => {
        const mockVerifyScreenshotFiles = jest.spyOn(screenshotService, 'verifyScreenshotFiles')
          .mockResolvedValue({ total: 10, existing: 9, missing: 1, errors: 0 });

        const timer = screenshotService.createPeriodicVerificationTask();

        expect(timer).toBeDefined();
        expect(typeof timer).toBe('object');

        // Fast forward to trigger initial execution
        jest.advanceTimersByTime(1000);
        expect(mockVerifyScreenshotFiles).toHaveBeenCalledTimes(1);

        // Fast forward 24 hours to trigger periodic execution
        jest.advanceTimersByTime(24 * 60 * 60 * 1000);
        expect(mockVerifyScreenshotFiles).toHaveBeenCalledTimes(2);

        clearInterval(timer);
      });

      it('should create periodic verification task with custom interval', () => {
        const mockVerifyScreenshotFiles = jest.spyOn(screenshotService, 'verifyScreenshotFiles')
          .mockResolvedValue({ total: 10, existing: 10, missing: 0, errors: 0 });

        const timer = screenshotService.createPeriodicVerificationTask(12);

        // Fast forward 12 hours
        jest.advanceTimersByTime(12 * 60 * 60 * 1000);
        expect(mockVerifyScreenshotFiles).toHaveBeenCalledTimes(2); // Initial + periodic

        clearInterval(timer);
      });

      it('should handle verification errors gracefully', () => {
        const mockVerifyScreenshotFiles = jest.spyOn(screenshotService, 'verifyScreenshotFiles')
          .mockRejectedValue(new Error('Verification failed'));

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        const timer = screenshotService.createPeriodicVerificationTask();

        jest.advanceTimersByTime(1000);
        
        // Allow promise to resolve
        return new Promise(resolve => {
          setTimeout(() => {
            expect(consoleSpy).toHaveBeenCalledWith(
              expect.stringContaining('初始验证任务执行失败'),
              expect.any(Error)
            );
            clearInterval(timer);
            consoleSpy.mockRestore();
            resolve(undefined);
          }, 0);
        });
      });
    });

    describe('createPeriodicCleanupTask', () => {
      it('should create periodic cleanup task with default settings', () => {
        const mockCleanupExpiredScreenshotsWithStats = jest.spyOn(screenshotService, 'cleanupExpiredScreenshotsWithStats')
          .mockResolvedValue({
            totalFound: 5,
            filesDeleted: 5,
            filesNotFound: 0,
            fileDeleteErrors: 0,
            recordsDeleted: 5,
            recordDeleteErrors: 0,
          });

        const timer = screenshotService.createPeriodicCleanupTask();

        // Fast forward 24 hours
        jest.advanceTimersByTime(24 * 60 * 60 * 1000);
        expect(mockCleanupExpiredScreenshotsWithStats).toHaveBeenCalledWith(30);

        clearInterval(timer);
      });

      it('should create periodic cleanup task with custom settings', () => {
        const mockCleanupExpiredScreenshotsWithStats = jest.spyOn(screenshotService, 'cleanupExpiredScreenshotsWithStats')
          .mockResolvedValue({
            totalFound: 0,
            filesDeleted: 0,
            filesNotFound: 0,
            fileDeleteErrors: 0,
            recordsDeleted: 0,
            recordDeleteErrors: 0,
          });

        const timer = screenshotService.createPeriodicCleanupTask(6, 7);

        // Fast forward 6 hours
        jest.advanceTimersByTime(6 * 60 * 60 * 1000);
        expect(mockCleanupExpiredScreenshotsWithStats).toHaveBeenCalledWith(7);

        clearInterval(timer);
      });

      it('should handle cleanup errors gracefully', () => {
        const mockCleanupExpiredScreenshotsWithStats = jest.spyOn(screenshotService, 'cleanupExpiredScreenshotsWithStats')
          .mockRejectedValue(new Error('Cleanup failed'));

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        const timer = screenshotService.createPeriodicCleanupTask();

        jest.advanceTimersByTime(24 * 60 * 60 * 1000);
        
        // Allow promise to resolve
        return new Promise(resolve => {
          setTimeout(() => {
            expect(consoleSpy).toHaveBeenCalledWith(
              expect.stringContaining('定期清理任务执行失败'),
              expect.any(Error)
            );
            clearInterval(timer);
            consoleSpy.mockRestore();
            resolve(undefined);
          }, 0);
        });
      });

      it('should log warnings for cleanup errors', () => {
        const mockCleanupExpiredScreenshotsWithStats = jest.spyOn(screenshotService, 'cleanupExpiredScreenshotsWithStats')
          .mockResolvedValue({
            totalFound: 10,
            filesDeleted: 5,
            filesNotFound: 2,
            fileDeleteErrors: 2,
            recordsDeleted: 8,
            recordDeleteErrors: 1,
          });

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        const timer = screenshotService.createPeriodicCleanupTask();

        jest.advanceTimersByTime(24 * 60 * 60 * 1000);
        
        // Allow promise to resolve
        return new Promise(resolve => {
          setTimeout(() => {
            expect(consoleSpy).toHaveBeenCalledWith(
              expect.stringContaining('清理过程中出现错误: 文件删除错误2个, 记录删除错误1个')
            );
            clearInterval(timer);
            consoleSpy.mockRestore();
            resolve(undefined);
          }, 0);
        });
      });
    });
  });

  describe('Configuration management', () => {
    it('should update cleanup configuration', () => {
      const newConfig = {
        defaultRetentionDays: 60,
        batchSize: 25,
        enableSafetyChecks: false,
      };

      screenshotService.updateCleanupConfig(newConfig);

      const currentConfig = screenshotService.getCleanupConfig();
      expect(currentConfig).toEqual(expect.objectContaining(newConfig));
    });

    it('should get current cleanup configuration', () => {
      const config = screenshotService.getCleanupConfig();

      expect(config).toEqual({
        defaultRetentionDays: 30,
        batchSize: 50,
        enableSafetyChecks: true,
        screenshotsDirectory: 'screenshots',
      });
    });

    it('should merge partial configuration updates', () => {
      screenshotService.updateCleanupConfig({ batchSize: 100 });

      const config = screenshotService.getCleanupConfig();
      expect(config.batchSize).toBe(100);
      expect(config.defaultRetentionDays).toBe(30); // Should remain unchanged
    });
  });

  describe('Edge cases and boundary conditions', () => {
    const mockStepScreenshots = {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      deleteMany: jest.fn(),
    };

    beforeEach(() => {
      (mockPrisma as any).step_screenshots = mockStepScreenshots;
    });

    it('should handle very large file sizes', async () => {
      const largeFileSize = Number.MAX_SAFE_INTEGER;
      
      const inputRecord: ScreenshotRecord = {
        runId: 'test-run-1',
        stepIndex: 1,
        status: 'success',
        filePath: 'screenshots/large.png',
        fileName: 'large.png',
        fileSize: largeFileSize,
      };

      const mockSavedRecord = {
        id: 1,
        run_id: 'test-run-1',
        test_case_id: null,
        step_index: '1',
        step_description: null,
        status: 'success',
        file_path: 'screenshots/large.png',
        file_name: 'large.png',
        file_size: BigInt(largeFileSize),
        mime_type: 'image/png',
        created_at: new Date(),
        file_exists: true,
      };

      mockStepScreenshots.create.mockResolvedValue(mockSavedRecord);

      const result = await screenshotService.saveScreenshot(inputRecord);

      expect(result.fileSize).toBe(largeFileSize);
    });

    it('should handle special characters in file names', async () => {
      const inputRecord: ScreenshotRecord = {
        runId: 'test-run-1',
        stepIndex: 'special',
        status: 'success',
        filePath: 'screenshots/测试-文件名_with@special#chars.png',
        fileName: '测试-文件名_with@special#chars.png',
      };

      const mockSavedRecord = {
        id: 1,
        run_id: 'test-run-1',
        test_case_id: null,
        step_index: 'special',
        step_description: null,
        status: 'success',
        file_path: 'screenshots/测试-文件名_with@special#chars.png',
        file_name: '测试-文件名_with@special#chars.png',
        file_size: null,
        mime_type: 'image/png',
        created_at: new Date(),
        file_exists: true,
      };

      mockStepScreenshots.create.mockResolvedValue(mockSavedRecord);

      const result = await screenshotService.saveScreenshot(inputRecord);

      expect(result.fileName).toBe('测试-文件名_with@special#chars.png');
    });

    it('should handle empty query results gracefully', async () => {
      mockStepScreenshots.findMany.mockResolvedValue([]);

      const result = await screenshotService.getScreenshotsByRunId('nonexistent-run');

      expect(result).toEqual([]);
    });

    it('should handle concurrent operations safely', async () => {
      const inputRecord: ScreenshotRecord = {
        runId: 'concurrent-test',
        stepIndex: 1,
        status: 'success',
        filePath: 'screenshots/concurrent.png',
        fileName: 'concurrent.png',
      };

      const mockSavedRecord = {
        id: 1,
        run_id: 'concurrent-test',
        test_case_id: null,
        step_index: '1',
        step_description: null,
        status: 'success',
        file_path: 'screenshots/concurrent.png',
        file_name: 'concurrent.png',
        file_size: null,
        mime_type: 'image/png',
        created_at: new Date(),
        file_exists: true,
      };

      mockStepScreenshots.create.mockResolvedValue(mockSavedRecord);

      // Simulate concurrent saves
      const promises = Array.from({ length: 10 }, () => 
        screenshotService.saveScreenshot({ ...inputRecord, fileName: `concurrent-${Math.random()}.png` })
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(mockStepScreenshots.create).toHaveBeenCalledTimes(10);
    });

    it('should handle step index parsing edge cases', async () => {
      const testCases = [
        { stepIndex: 'initial', expectedOrder: -1 },
        { stepIndex: 'start', expectedOrder: -1 },
        { stepIndex: 'final', expectedOrder: 999999 },
        { stepIndex: 'end', expectedOrder: 999999 },
        { stepIndex: 'invalid', expectedOrder: 0 },
        { stepIndex: '0', expectedOrder: 0 },
        { stepIndex: '-1', expectedOrder: -1 },
        { stepIndex: '999', expectedOrder: 999 },
      ];

      for (const testCase of testCases) {
        const mockScreenshots = [{
          id: 1,
          run_id: 'test-run-1',
          test_case_id: null,
          step_index: testCase.stepIndex,
          step_description: null,
          status: 'success',
          file_path: 'screenshots/test.png',
          file_name: 'test.png',
          file_size: null,
          mime_type: 'image/png',
          created_at: new Date(),
          file_exists: true,
        }];

        mockStepScreenshots.findMany.mockResolvedValue(mockScreenshots);

        const result = await screenshotService.getScreenshotsByRunId('test-run-1');

        expect(result[0].stepIndex).toBe(testCase.stepIndex);
      }
    });
  });

  describe('disconnect', () => {
    it('should disconnect Prisma client', async () => {
      const mockDisconnect = jest.fn();
      (mockPrisma as any).$disconnect = mockDisconnect;

      await screenshotService.disconnect();

      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });

    it('should handle disconnect errors gracefully', async () => {
      const mockDisconnect = jest.fn().mockRejectedValue(new Error('Disconnect failed'));
      (mockPrisma as any).$disconnect = mockDisconnect;

      await expect(screenshotService.disconnect()).rejects.toThrow('Disconnect failed');
    });
  });

  describe('Private method testing through public interface', () => {
    it('should test convertPrismaToScreenshotRecord through public methods', async () => {
      const mockStepScreenshots = {
        findFirst: jest.fn(),
      };

      (mockPrisma as any).step_screenshots = mockStepScreenshots;

      const mockPrismaRecord = {
        id: 1,
        run_id: 'test-run-1',
        test_case_id: 123,
        step_index: '1',
        step_description: 'Test step',
        status: 'success',
        file_path: 'screenshots/test.png',
        file_name: 'test.png',
        file_size: BigInt(1024),
        mime_type: 'image/png',
        created_at: new Date('2024-01-01T00:00:00Z'),
        file_exists: true,
      };

      mockStepScreenshots.findFirst.mockResolvedValue(mockPrismaRecord);

      const result = await screenshotService.getStepScreenshot('test-run-1', 1);

      expect(result).toEqual({
        id: 1,
        runId: 'test-run-1',
        testCaseId: 123,
        stepIndex: '1',
        stepDescription: 'Test step',
        status: 'success',
        filePath: 'screenshots/test.png',
        fileName: 'test.png',
        fileSize: 1024,
        mimeType: 'image/png',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        fileExists: true,
      });
    });

    it('should test parseStepIndex through sorting behavior', async () => {
      const mockStepScreenshots = {
        findMany: jest.fn(),
      };

      (mockPrisma as any).step_screenshots = mockStepScreenshots;

      const mockScreenshots = [
        {
          id: 1,
          run_id: 'test-run-1',
          test_case_id: null,
          step_index: 'final',
          step_description: null,
          status: 'success',
          file_path: 'screenshots/final.png',
          file_name: 'final.png',
          file_size: null,
          mime_type: 'image/png',
          created_at: new Date('2024-01-01T00:00:00Z'),
          file_exists: true,
        },
        {
          id: 2,
          run_id: 'test-run-1',
          test_case_id: null,
          step_index: '1',
          step_description: null,
          status: 'success',
          file_path: 'screenshots/step1.png',
          file_name: 'step1.png',
          file_size: null,
          mime_type: 'image/png',
          created_at: new Date('2024-01-01T00:01:00Z'),
          file_exists: true,
        },
        {
          id: 3,
          run_id: 'test-run-1',
          test_case_id: null,
          step_index: 'initial',
          step_description: null,
          status: 'success',
          file_path: 'screenshots/initial.png',
          file_name: 'initial.png',
          file_size: null,
          mime_type: 'image/png',
          created_at: new Date('2024-01-01T00:02:00Z'),
          file_exists: true,
        },
      ];

      mockStepScreenshots.findMany.mockResolvedValue(mockScreenshots);

      const result = await screenshotService.getScreenshotsByRunId('test-run-1');

      // Should be sorted as: initial (-1), 1 (1), final (999999)
      expect(result[0].stepIndex).toBe('initial');
      expect(result[1].stepIndex).toBe('1');
      expect(result[2].stepIndex).toBe('final');
    });
  });
});