import { ScreenshotService } from '../screenshotService';
import { PrismaClient } from '../../../src/generated/prisma';
import { ScreenshotRecord } from '../../types/screenshot';
import * as fs from 'fs';
import * as path from 'path';

// Mock dependencies
jest.mock('../../../src/generated/prisma');
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
    access: jest.fn(),
    unlink: jest.fn(),
    mkdir: jest.fn(),
  },
  constants: {
    F_OK: 0,
  },
  existsSync: jest.fn().mockReturnValue(true),
}));

describe('Screenshot Integration Tests', () => {
  let screenshotService: ScreenshotService;
  let mockPrisma: jest.Mocked<PrismaClient>;

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
    jest.clearAllMocks();
    
    mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    (mockPrisma as any).step_screenshots = mockStepScreenshots;
    (mockPrisma as any).$disconnect = jest.fn();

    screenshotService = new ScreenshotService(mockPrisma);
    
    // Mock file system operations
    jest.spyOn(fs.promises, 'stat').mockResolvedValue({ size: 1024 } as any);
    jest.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
    jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);
    jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Complete Screenshot Save Flow', () => {
    it('should save screenshot with complete metadata flow', async () => {
      // Arrange
      const runId = 'integration-test-run-1';
      const testCaseId = 123;
      const stepIndex = 1;
      const stepDescription = 'Click login button';
      const status = 'success';
      const fileName = `${runId}-step-${stepIndex}-${status}.png`;
      const filePath = `screenshots/${fileName}`;

      const mockSavedRecord = {
        id: 1,
        run_id: runId,
        test_case_id: testCaseId,
        step_index: stepIndex.toString(),
        step_description: stepDescription,
        status: status,
        file_path: filePath,
        file_name: fileName,
        file_size: BigInt(1024),
        mime_type: 'image/png',
        created_at: new Date('2024-01-01T00:00:00Z'),
        file_exists: true,
      };

      mockStepScreenshots.create.mockResolvedValue(mockSavedRecord);

      // Act
      const screenshotRecord: ScreenshotRecord = {
        runId,
        testCaseId,
        stepIndex,
        stepDescription,
        status,
        filePath,
        fileName,
        mimeType: 'image/png',
      };

      const result = await screenshotService.saveScreenshot(screenshotRecord);

      // Assert
      expect(mockStepScreenshots.create).toHaveBeenCalledWith({
        data: {
          run_id: runId,
          test_case_id: testCaseId,
          step_index: stepIndex.toString(),
          step_description: stepDescription,
          status: status,
          file_path: filePath,
          file_name: fileName,
          file_size: BigInt(1024),
          mime_type: 'image/png',
          file_exists: true,
        },
      });

      expect(result).toEqual({
        id: 1,
        runId,
        testCaseId,
        stepIndex: stepIndex.toString(),
        stepDescription,
        status,
        filePath,
        fileName,
        fileSize: 1024,
        mimeType: 'image/png',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        fileExists: true,
      });

      expect(fs.promises.stat).toHaveBeenCalledWith(path.resolve(filePath));
    });

    it('should handle screenshot save with file system errors gracefully', async () => {
      // Arrange
      const runId = 'integration-test-run-2';
      const fileName = `${runId}-step-1-failed.png`;
      const filePath = `screenshots/${fileName}`;

      jest.spyOn(fs.promises, 'stat').mockRejectedValue(new Error('File not found'));

      const mockSavedRecord = {
        id: 2,
        run_id: runId,
        test_case_id: null,
        step_index: '1',
        step_description: 'Test step',
        status: 'failed',
        file_path: filePath,
        file_name: fileName,
        file_size: BigInt(0),
        mime_type: 'image/png',
        created_at: new Date('2024-01-01T00:00:00Z'),
        file_exists: true,
      };

      mockStepScreenshots.create.mockResolvedValue(mockSavedRecord);

      // Act
      const screenshotRecord: ScreenshotRecord = {
        runId,
        stepIndex: 1,
        stepDescription: 'Test step',
        status: 'failed',
        filePath,
        fileName,
      };

      const result = await screenshotService.saveScreenshot(screenshotRecord);

      // Assert
      expect(result.fileSize).toBe(0);
      expect(mockStepScreenshots.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          file_size: BigInt(0),
        }),
      });
    });
  });

  describe('Screenshot Query and Retrieval Flow', () => {
    it('should retrieve screenshots by run ID with proper sorting', async () => {
      // Arrange
      const runId = 'integration-test-run-3';
      const mockScreenshots = [
        {
          id: 1,
          run_id: runId,
          test_case_id: 123,
          step_index: '1',
          step_description: 'Navigate to login page',
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
          run_id: runId,
          test_case_id: 123,
          step_index: '10',
          step_description: 'Submit form',
          status: 'success',
          file_path: 'screenshots/step10.png',
          file_name: 'step10.png',
          file_size: BigInt(2048),
          mime_type: 'image/png',
          created_at: new Date('2024-01-01T00:01:00Z'),
          file_exists: true,
        },
        {
          id: 3,
          run_id: runId,
          test_case_id: 123,
          step_index: '2',
          step_description: 'Enter credentials',
          status: 'success',
          file_path: 'screenshots/step2.png',
          file_name: 'step2.png',
          file_size: BigInt(1536),
          mime_type: 'image/png',
          created_at: new Date('2024-01-01T00:02:00Z'),
          file_exists: true,
        },
        {
          id: 4,
          run_id: runId,
          test_case_id: 123,
          step_index: 'final',
          step_description: 'Test completion',
          status: 'completed',
          file_path: 'screenshots/final.png',
          file_name: 'final.png',
          file_size: BigInt(3072),
          mime_type: 'image/png',
          created_at: new Date('2024-01-01T00:03:00Z'),
          file_exists: true,
        },
      ];

      mockStepScreenshots.findMany.mockResolvedValue(mockScreenshots);

      // Act
      const result = await screenshotService.getScreenshotsByRunId(runId);

      // Assert
      expect(result).toHaveLength(4);
      
      // Verify proper numeric sorting: 1, 2, 10, final
      expect(result[0].stepIndex).toBe('1');
      expect(result[1].stepIndex).toBe('2');
      expect(result[2].stepIndex).toBe('10');
      expect(result[3].stepIndex).toBe('final');

      expect(mockStepScreenshots.findMany).toHaveBeenCalledWith({
        where: { run_id: runId },
        orderBy: [
          { step_index: 'asc' },
          { created_at: 'asc' }
        ],
      });
    });

    it('should retrieve specific step screenshot', async () => {
      // Arrange
      const runId = 'integration-test-run-4';
      const stepIndex = 'final';
      
      const mockScreenshot = {
        id: 5,
        run_id: runId,
        test_case_id: 456,
        step_index: stepIndex,
        step_description: 'Final verification',
        status: 'completed',
        file_path: 'screenshots/final-verification.png',
        file_name: 'final-verification.png',
        file_size: BigInt(4096),
        mime_type: 'image/png',
        created_at: new Date('2024-01-01T00:00:00Z'),
        file_exists: true,
      };

      mockStepScreenshots.findFirst.mockResolvedValue(mockScreenshot);

      // Act
      const result = await screenshotService.getStepScreenshot(runId, stepIndex);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.stepIndex).toBe(stepIndex);
      expect(result?.stepDescription).toBe('Final verification');
      expect(result?.fileSize).toBe(4096);

      expect(mockStepScreenshots.findFirst).toHaveBeenCalledWith({
        where: {
          run_id: runId,
          step_index: stepIndex,
        },
        orderBy: {
          created_at: 'desc',
        },
      });
    });

    it('should handle pagination correctly', async () => {
      // Arrange
      const runId = 'integration-test-run-5';
      const mockScreenshots = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        run_id: runId,
        test_case_id: 789,
        step_index: (i + 1).toString(),
        step_description: `Step ${i + 1}`,
        status: 'success',
        file_path: `screenshots/step${i + 1}.png`,
        file_name: `step${i + 1}.png`,
        file_size: BigInt(1024 * (i + 1)),
        mime_type: 'image/png',
        created_at: new Date(`2024-01-01T00:0${i}:00Z`),
        file_exists: true,
      }));

      mockStepScreenshots.findMany.mockResolvedValue(mockScreenshots.slice(2, 4)); // Return items 3-4

      // Act
      const result = await screenshotService.getScreenshotsByRunId(runId, {
        limit: 2,
        offset: 2,
        orderBy: 'created_at',
        orderDirection: 'asc'
      });

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].stepIndex).toBe('3');
      expect(result[1].stepIndex).toBe('4');

      expect(mockStepScreenshots.findMany).toHaveBeenCalledWith({
        where: { run_id: runId },
        orderBy: { created_at: 'asc' },
        take: 2,
        skip: 2,
      });
    });
  });

  describe('File Verification Integration', () => {
    it('should verify file existence and update database status', async () => {
      // Arrange
      const screenshotId = 10;
      const mockScreenshot = {
        id: screenshotId,
        file_path: 'screenshots/existing-file.png',
        file_name: 'existing-file.png',
        file_exists: true,
      };

      mockStepScreenshots.findUnique.mockResolvedValue(mockScreenshot);
      jest.spyOn(fs.promises, 'access').mockResolvedValue(undefined);

      // Act
      const result = await screenshotService.verifyScreenshotFile(screenshotId);

      // Assert
      expect(result).toBe(true);
      expect(fs.promises.access).toHaveBeenCalledWith(
        path.resolve('screenshots/existing-file.png'),
        fs.constants.F_OK
      );
      expect(mockStepScreenshots.update).not.toHaveBeenCalled(); // Status unchanged
    });

    it('should detect missing file and update database', async () => {
      // Arrange
      const screenshotId = 11;
      const mockScreenshot = {
        id: screenshotId,
        file_path: 'screenshots/missing-file.png',
        file_name: 'missing-file.png',
        file_exists: true, // Database thinks it exists
      };

      mockStepScreenshots.findUnique.mockResolvedValue(mockScreenshot);
      jest.spyOn(fs.promises, 'access').mockRejectedValue(new Error('File not found'));

      // Act
      const result = await screenshotService.verifyScreenshotFile(screenshotId);

      // Assert
      expect(result).toBe(false);
      expect(mockStepScreenshots.update).toHaveBeenCalledWith({
        where: { id: screenshotId },
        data: { file_exists: false },
      });
    });

    it('should perform batch file verification', async () => {
      // Arrange
      const mockScreenshots = [
        { id: 1, file_path: 'screenshots/file1.png', file_name: 'file1.png', file_exists: true },
        { id: 2, file_path: 'screenshots/file2.png', file_name: 'file2.png', file_exists: true },
        { id: 3, file_path: 'screenshots/file3.png', file_name: 'file3.png', file_exists: false },
      ];

      mockStepScreenshots.findMany.mockResolvedValue(mockScreenshots);
      
      jest.spyOn(fs.promises, 'access')
        .mockResolvedValueOnce(undefined) // file1 exists
        .mockRejectedValueOnce(new Error('File not found')) // file2 missing
        .mockRejectedValueOnce(new Error('File not found')); // file3 missing

      // Act
      const result = await screenshotService.verifyScreenshotFiles([1, 2, 3]);

      // Assert
      expect(result).toEqual({
        total: 3,
        existing: 1,
        missing: 2,
        errors: 0,
      });

      expect(mockStepScreenshots.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { file_exists: false },
      });
      // file3 status unchanged since it was already false
    });
  });

  describe('Cleanup Integration', () => {
    it('should perform complete cleanup flow with file and database operations', async () => {
      // Arrange
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

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

      jest.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
      jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);

      // Act
      const result = await screenshotService.cleanupExpiredScreenshotsWithStats(30);

      // Assert
      expect(result).toEqual({
        totalFound: 2,
        filesDeleted: 2,
        filesNotFound: 0,
        fileDeleteErrors: 0,
        recordsDeleted: 2,
        recordDeleteErrors: 0,
      });

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

      expect(fs.promises.unlink).toHaveBeenCalledTimes(2);
      expect(mockStepScreenshots.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] } },
      });
    });

    it('should handle partial cleanup failures gracefully', async () => {
      // Arrange
      const mockExpiredScreenshots = [
        {
          id: 1,
          file_path: 'screenshots/deletable.png',
          file_name: 'deletable.png',
          created_at: new Date('2023-01-01'),
        },
        {
          id: 2,
          file_path: 'screenshots/protected.png',
          file_name: 'protected.png',
          created_at: new Date('2023-01-02'),
        },
        {
          id: 3,
          file_path: 'screenshots/missing.png',
          file_name: 'missing.png',
          created_at: new Date('2023-01-03'),
        },
      ];

      mockStepScreenshots.findMany.mockResolvedValue(mockExpiredScreenshots);
      mockStepScreenshots.deleteMany.mockResolvedValue({ count: 3 });

      jest.spyOn(fs.promises, 'access')
        .mockResolvedValueOnce(undefined) // deletable.png exists
        .mockResolvedValueOnce(undefined) // protected.png exists
        .mockRejectedValueOnce(new Error('File not found')); // missing.png doesn't exist

      jest.spyOn(fs.promises, 'unlink')
        .mockResolvedValueOnce(undefined) // deletable.png deleted successfully
        .mockRejectedValueOnce(new Error('Permission denied')); // protected.png deletion fails

      // Act
      const result = await screenshotService.cleanupExpiredScreenshotsWithStats(30);

      // Assert
      expect(result).toEqual({
        totalFound: 3,
        filesDeleted: 1,
        filesNotFound: 2, // missing.png + protected.png (failed to delete)
        fileDeleteErrors: 0,
        recordsDeleted: 3,
        recordDeleteErrors: 0,
      });
    });

    it('should respect safety checks for file paths', async () => {
      // Arrange
      const service = new ScreenshotService(mockPrisma, {
        enableSafetyChecks: true,
        screenshotsDirectory: 'screenshots'
      });

      const mockExpiredScreenshots = [
        {
          id: 1,
          file_path: '/etc/passwd', // Dangerous path
          file_name: 'passwd',
          created_at: new Date('2023-01-01'),
        },
        {
          id: 2,
          file_path: 'screenshots/safe.png', // Safe path
          file_name: 'safe.png',
          created_at: new Date('2023-01-02'),
        },
      ];

      mockStepScreenshots.findMany.mockResolvedValue(mockExpiredScreenshots);
      mockStepScreenshots.deleteMany.mockResolvedValue({ count: 2 });

      jest.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
      jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);

      // Act
      const result = await service.cleanupExpiredScreenshotsWithStats(30);

      // Assert
      expect(result.filesDeleted).toBe(1); // Only safe.png deleted
      expect(fs.promises.unlink).toHaveBeenCalledTimes(1);
      expect(fs.promises.unlink).toHaveBeenCalledWith(path.resolve('screenshots/safe.png'));
      expect(result.recordsDeleted).toBe(2); // Both database records deleted
    });
  });

  describe('Storage Statistics Integration', () => {
    it('should calculate comprehensive storage statistics', async () => {
      // Arrange
      mockStepScreenshots.count
        .mockResolvedValueOnce(1000) // totalScreenshots
        .mockResolvedValueOnce(50) // missingFiles
        .mockResolvedValueOnce(25) // last24Hours
        .mockResolvedValueOnce(150) // last7Days
        .mockResolvedValueOnce(400); // last30Days

      mockStepScreenshots.aggregate
        .mockResolvedValueOnce({
          _sum: { file_size: BigInt(104857600) }, // 100MB total
          _avg: { file_size: BigInt(104857) }, // ~100KB average
        })
        .mockResolvedValueOnce({
          _min: { created_at: new Date('2023-12-01T00:00:00Z') },
          _max: { created_at: new Date('2024-01-15T00:00:00Z') },
        });

      mockStepScreenshots.groupBy.mockResolvedValueOnce([
        { status: 'success', _count: { _all: 700 }, _sum: { file_size: BigInt(73400320) } },
        { status: 'failed', _count: { _all: 200 }, _sum: { file_size: BigInt(20971520) } },
        { status: 'error', _count: { _all: 80 }, _sum: { file_size: BigInt(8388608) } },
        { status: 'completed', _count: { _all: 20 }, _sum: { file_size: BigInt(2097152) } },
      ]);

      mockStepScreenshots.findMany
        .mockResolvedValueOnce([
          { file_name: 'huge-screenshot.png', file_size: BigInt(5242880), run_id: 'run-1' }
        ])
        .mockResolvedValueOnce([
          { file_name: 'tiny-screenshot.png', file_size: BigInt(512), run_id: 'run-2' }
        ]);

      // Act
      const stats = await screenshotService.getStorageStats();

      // Assert
      expect(stats).toEqual({
        totalScreenshots: 1000,
        totalSize: 104857600,
        avgFileSize: 104857,
        oldestScreenshot: new Date('2023-12-01T00:00:00Z'),
        newestScreenshot: new Date('2024-01-15T00:00:00Z'),
        missingFiles: 50,
        sizeByStatus: {
          success: 73400320,
          failed: 20971520,
          error: 8388608,
          completed: 2097152,
        },
        countByStatus: {
          success: 700,
          failed: 200,
          error: 80,
          completed: 20,
        },
        largestFile: {
          fileName: 'huge-screenshot.png',
          size: 5242880,
          runId: 'run-1',
        },
        smallestFile: {
          fileName: 'tiny-screenshot.png',
          size: 512,
          runId: 'run-2',
        },
        recentActivity: {
          last24Hours: 25,
          last7Days: 150,
          last30Days: 400,
        },
        storageHealth: {
          healthScore: 90, // 100 - (5% missing * 2)
          issues: ['50 个截图文件缺失 (5.0%)'],
          recommendations: ['存储状态良好，继续保持'],
        },
      });

      // Verify all database queries were made
      expect(mockStepScreenshots.count).toHaveBeenCalledTimes(5);
      expect(mockStepScreenshots.aggregate).toHaveBeenCalledTimes(2);
      expect(mockStepScreenshots.groupBy).toHaveBeenCalledTimes(1);
      expect(mockStepScreenshots.findMany).toHaveBeenCalledTimes(2);
    });

    it('should handle empty database gracefully', async () => {
      // Arrange
      mockStepScreenshots.count.mockResolvedValueOnce(0);

      // Act
      const stats = await screenshotService.getStorageStats();

      // Assert
      expect(stats.totalScreenshots).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.storageHealth.healthScore).toBe(100);
      expect(stats.storageHealth.issues).toEqual([]);
      expect(stats.largestFile).toBeNull();
      expect(stats.smallestFile).toBeNull();

      // Should not make additional queries when no screenshots exist
      expect(mockStepScreenshots.aggregate).not.toHaveBeenCalled();
      expect(mockStepScreenshots.groupBy).not.toHaveBeenCalled();
      expect(mockStepScreenshots.findMany).not.toHaveBeenCalled();
    });
  });

  describe('Database Transaction Safety', () => {
    it('should handle database connection failures gracefully', async () => {
      // Arrange
      mockStepScreenshots.create.mockRejectedValue(new Error('Database connection lost'));

      const screenshotRecord: ScreenshotRecord = {
        runId: 'test-run-db-fail',
        stepIndex: 1,
        status: 'success',
        filePath: 'screenshots/test.png',
        fileName: 'test.png',
      };

      // Act & Assert
      await expect(screenshotService.saveScreenshot(screenshotRecord))
        .rejects.toThrow('保存截图记录失败: Database connection lost');
    });

    it('should handle concurrent screenshot saves', async () => {
      // Arrange
      const baseRecord: ScreenshotRecord = {
        runId: 'concurrent-test-run',
        stepIndex: 1,
        status: 'success',
        filePath: 'screenshots/concurrent.png',
        fileName: 'concurrent.png',
      };

      // Mock successful saves for all concurrent operations
      mockStepScreenshots.create.mockImplementation((data) => 
        Promise.resolve({
          id: Math.floor(Math.random() * 1000),
          run_id: data.data.run_id,
          test_case_id: data.data.test_case_id,
          step_index: data.data.step_index,
          step_description: data.data.step_description,
          status: data.data.status,
          file_path: data.data.file_path,
          file_name: data.data.file_name,
          file_size: data.data.file_size,
          mime_type: data.data.mime_type,
          created_at: new Date(),
          file_exists: data.data.file_exists,
        })
      );

      // Act
      const concurrentSaves = Array.from({ length: 10 }, (_, i) => 
        screenshotService.saveScreenshot({
          ...baseRecord,
          stepIndex: i + 1,
          fileName: `concurrent-${i + 1}.png`,
          filePath: `screenshots/concurrent-${i + 1}.png`,
        })
      );

      const results = await Promise.all(concurrentSaves);

      // Assert
      expect(results).toHaveLength(10);
      expect(mockStepScreenshots.create).toHaveBeenCalledTimes(10);
      
      // Verify all saves completed successfully
      results.forEach((result, index) => {
        expect(result.stepIndex).toBe((index + 1).toString());
        expect(result.fileName).toBe(`concurrent-${index + 1}.png`);
      });
    });

    it('should handle partial batch operations correctly', async () => {
      // Arrange
      const mockScreenshots = [
        { id: 1, file_path: 'screenshots/file1.png', file_name: 'file1.png', file_exists: true },
        { id: 2, file_path: 'screenshots/file2.png', file_name: 'file2.png', file_exists: true },
        { id: 3, file_path: 'screenshots/file3.png', file_name: 'file3.png', file_exists: true },
      ];

      mockStepScreenshots.findMany.mockResolvedValue(mockScreenshots);
      
      // Mock file access to simulate mixed results
      jest.spyOn(fs.promises, 'access')
        .mockResolvedValueOnce(undefined) // file1 exists
        .mockRejectedValueOnce(new Error('File not found')) // file2 missing
        .mockRejectedValueOnce(new Error('Permission denied')); // file3 access error

      // Mock database updates
      mockStepScreenshots.update.mockResolvedValue({} as any);

      // Act
      const result = await screenshotService.verifyScreenshotFiles([1, 2, 3]);

      // Assert
      expect(result).toEqual({
        total: 3,
        existing: 1,
        missing: 2,
        errors: 0,
      });

      // Verify database updates for changed statuses
      expect(mockStepScreenshots.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { file_exists: false },
      });
      expect(mockStepScreenshots.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { file_exists: false },
      });
    });
  });

  describe('Integration Test Summary', () => {
    it('should demonstrate complete screenshot workflow integration', async () => {
      // This test demonstrates the integration between different components
      // and verifies that the screenshot service works correctly with database operations
      
      // Arrange
      const runId = 'integration-workflow-test';
      const screenshotRecord: ScreenshotRecord = {
        runId,
        stepIndex: 1,
        status: 'success',
        filePath: 'screenshots/workflow-test.png',
        fileName: 'workflow-test.png',
        stepDescription: 'Integration test step',
      };

      const mockSavedRecord = {
        id: 1,
        run_id: runId,
        test_case_id: null,
        step_index: '1',
        step_description: 'Integration test step',
        status: 'success',
        file_path: 'screenshots/workflow-test.png',
        file_name: 'workflow-test.png',
        file_size: BigInt(1024),
        mime_type: 'image/png',
        created_at: new Date(),
        file_exists: true,
      };

      mockStepScreenshots.create.mockResolvedValue(mockSavedRecord);
      mockStepScreenshots.findMany.mockResolvedValue([mockSavedRecord]);

      // Act - Save screenshot
      const saveResult = await screenshotService.saveScreenshot(screenshotRecord);
      
      // Act - Retrieve screenshots
      const retrieveResult = await screenshotService.getScreenshotsByRunId(runId);

      // Assert
      expect(saveResult.id).toBe(1);
      expect(saveResult.runId).toBe(runId);
      expect(retrieveResult).toHaveLength(1);
      expect(retrieveResult[0].fileName).toBe('workflow-test.png');
      
      // Verify database interactions
      expect(mockStepScreenshots.create).toHaveBeenCalledTimes(1);
      expect(mockStepScreenshots.findMany).toHaveBeenCalledTimes(1);
    });
  });
});