import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { IndexMonitorService, startSearchIndexMonitor } from './index-monitor.service';
import { SearchEngineService, IndexMeta } from './search-engine.service';
import { BackendService } from './backend.service';
import { Datastore } from '../models';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock crypto.subtle synchronously for faster tests
const nodeCrypto = require('crypto');
function syncHash(data: ArrayBuffer): ArrayBuffer {
  const hash = nodeCrypto.createHash('sha256');
  hash.update(Buffer.from(data));
  return hash.digest().buffer;
}

if (typeof crypto === 'undefined' || !crypto.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      subtle: {
        digest: async (_algorithm: string, data: ArrayBuffer) => {
          return syncHash(data);
        }
      }
    }
  });
}

describe('IndexMonitorService', () => {
  let service: IndexMonitorService;
  let mockBackend: Partial<BackendService>;
  let mockSearchEngine: Partial<SearchEngineService>;
  let datastoreSubject: BehaviorSubject<Datastore | null>;
  let storedMeta: IndexMeta | null = null;

  const createDatastore = (overrides: Partial<Datastore> = {}): Datastore => ({
    schemaVersion: 1,
    generatedAt: '2024-01-01T00:00:00Z',
    revisionId: 1,
    members: [],
    topics: [],
    tags: [],
    ...overrides
  });

  beforeEach(() => {
    localStorageMock.clear();
    storedMeta = null;

    datastoreSubject = new BehaviorSubject<Datastore | null>(null);

    mockBackend = {
      datastore$: datastoreSubject.asObservable()
    };

    let indexSize = 0;
    mockSearchEngine = {
      buildIndex: vi.fn().mockImplementation(async (ds: Datastore) => {
        // Simulate building index - set size based on topics
        indexSize = ds.topics?.length || 0;
      }),
      getIndexMeta: vi.fn(() => storedMeta),
      setIndexMeta: vi.fn((checksum: string) => {
        storedMeta = { checksum, builtAt: new Date().toISOString(), flexVersion: '0.8.212' };
      }),
      getIndexSize: vi.fn(() => indexSize)
    };

    service = new IndexMonitorService(
      mockBackend as BackendService,
      mockSearchEngine as SearchEngineService
    );
  });

  afterEach(() => {
    service.stop();
  });

  describe('start/stop', () => {
    it('should start monitoring', () => {
      service.start();
      expect(service.isMonitoring()).toBe(true);
    });

    it('should stop monitoring', () => {
      service.start();
      service.stop();
      expect(service.isMonitoring()).toBe(false);
    });

    it('should return stop function from start', () => {
      const stop = service.start();
      expect(service.isMonitoring()).toBe(true);
      
      stop();
      expect(service.isMonitoring()).toBe(false);
    });
  });

  describe('checkAndRebuildIfNeeded', () => {
    it('should not rebuild if no datastore is loaded', async () => {
      service.start();
      await service.checkAndRebuildIfNeeded();
      service.stop();
      
      expect(mockSearchEngine.buildIndex).not.toHaveBeenCalled();
    });

    it('should rebuild on first datastore load (no previous checksum)', async () => {
      const ds = createDatastore();
      
      // Set current datastore directly and call check
      (service as any).currentDatastore = ds;
      await service.checkAndRebuildIfNeeded();
      
      expect(mockSearchEngine.buildIndex).toHaveBeenCalled();
      expect(mockSearchEngine.setIndexMeta).toHaveBeenCalled();
    });

    it('should not rebuild if checksum matches and index has data', async () => {
      const ds = createDatastore();
      
      // Set current datastore directly
      (service as any).currentDatastore = ds;
      
      // First build
      await service.checkAndRebuildIfNeeded();
      expect(mockSearchEngine.buildIndex).toHaveBeenCalledTimes(1);
      
      // Reset mocks but index still has data (getIndexSize still returns 0 in our mock after build)
      // To properly test "no rebuild if checksum matches", we need to make sure getIndexSize > 0
      // Update the mock to return a non-zero size
      vi.mocked(mockSearchEngine.getIndexSize!).mockReturnValue(1);
      vi.clearAllMocks();
      
      // Trigger another check with same datastore
      await service.checkAndRebuildIfNeeded();
      
      // Should not rebuild since checksum matches AND index is not empty
      expect(mockSearchEngine.buildIndex).not.toHaveBeenCalled();
    });

    it('should rebuild if checksum matches but index is empty (page reload scenario)', async () => {
      const ds = createDatastore();
      
      // Set current datastore directly
      (service as any).currentDatastore = ds;
      
      // First build
      await service.checkAndRebuildIfNeeded();
      expect(mockSearchEngine.buildIndex).toHaveBeenCalledTimes(1);
      
      // Reset mocks to simulate page reload - index is empty but checksum stored
      vi.mocked(mockSearchEngine.getIndexSize!).mockReturnValue(0);
      vi.clearAllMocks();
      
      // Trigger another check - should rebuild because index is empty
      await service.checkAndRebuildIfNeeded();
      
      expect(mockSearchEngine.buildIndex).toHaveBeenCalledTimes(1);
    });

    it('should rebuild if datastore content changes', async () => {
      // First build
      (service as any).currentDatastore = createDatastore({ schemaVersion: 1 });
      await service.checkAndRebuildIfNeeded();
      expect(mockSearchEngine.buildIndex).toHaveBeenCalledTimes(1);
      
      // Change content (schemaVersion affects checksum)
      (service as any).currentDatastore = createDatastore({ schemaVersion: 2 });
      await service.checkAndRebuildIfNeeded();
      
      expect(mockSearchEngine.buildIndex).toHaveBeenCalledTimes(2);
    });

    it('should not rebuild if only excluded fields change and index has data', async () => {
      // First build
      (service as any).currentDatastore = createDatastore({ 
        generatedAt: '2024-01-01T00:00:00Z',
        revisionId: 1 
      });
      await service.checkAndRebuildIfNeeded();
      expect(mockSearchEngine.buildIndex).toHaveBeenCalledTimes(1);
      
      // Mark index as having data
      vi.mocked(mockSearchEngine.getIndexSize!).mockReturnValue(1);
      vi.clearAllMocks();
      
      // Change only excluded fields
      (service as any).currentDatastore = createDatastore({ 
        generatedAt: '2024-12-31T23:59:59Z',
        revisionId: 999 
      });
      await service.checkAndRebuildIfNeeded();
      
      // Should not rebuild since content checksum is the same AND index has data
      expect(mockSearchEngine.buildIndex).not.toHaveBeenCalled();
    });

    it('should prevent overlapping rebuilds', async () => {
      let resolveSlowBuild: () => void;
      const slowBuildPromise = new Promise<void>(resolve => {
        resolveSlowBuild = resolve;
      });
      
      mockSearchEngine.buildIndex = vi.fn().mockReturnValue(slowBuildPromise);
      (service as any).currentDatastore = createDatastore();

      // Start first rebuild
      const promise1 = service.checkAndRebuildIfNeeded();
      
      // Try to trigger another rebuild immediately (should be skipped due to mutex)
      const promise2 = service.checkAndRebuildIfNeeded();
      
      // Resolve the slow build
      resolveSlowBuild!();
      await Promise.all([promise1, promise2]);
      
      // Only one build should have been started
      expect(mockSearchEngine.buildIndex).toHaveBeenCalledTimes(1);
    });
  });

  describe('periodic checking', () => {
    it('should start and stop periodic checking', () => {
      service.start({ intervalMs: 1000 });
      expect(service.isMonitoring()).toBe(true);
      
      service.stop();
      expect(service.isMonitoring()).toBe(false);
    });

    it('should use default interval when not specified', () => {
      service.start();
      expect(service.isMonitoring()).toBe(true);
      service.stop();
      // Default is 5000ms - we just verify it starts
    });
  });

  describe('forceRebuild', () => {
    it('should rebuild even if checksum matches', async () => {
      const ds = createDatastore();
      
      // First build
      (service as any).currentDatastore = ds;
      await service.checkAndRebuildIfNeeded();
      expect(mockSearchEngine.buildIndex).toHaveBeenCalledTimes(1);
      
      // Force rebuild
      await service.forceRebuild();
      
      expect(mockSearchEngine.buildIndex).toHaveBeenCalledTimes(2);
    });

    it('should wait for ongoing rebuild to complete', async () => {
      let resolveSlowBuild: () => void;
      const slowBuildPromise = new Promise<void>(resolve => {
        resolveSlowBuild = resolve;
      });
      mockSearchEngine.buildIndex = vi.fn().mockReturnValue(slowBuildPromise);

      (service as any).currentDatastore = createDatastore();
      
      // Start regular rebuild
      const regularPromise = service.checkAndRebuildIfNeeded();
      
      // Start force rebuild while regular is in progress
      const forcePromise = service.forceRebuild();
      
      // Resolve the slow build
      resolveSlowBuild!();
      await regularPromise;
      await forcePromise;
      
      // Both rebuilds should have been called
      expect(mockSearchEngine.buildIndex).toHaveBeenCalledTimes(2);
    });
  });

  describe('getLastChecksum', () => {
    it('should return null initially', () => {
      expect(service.getLastChecksum()).toBeNull();
    });

    it('should return checksum after check', async () => {
      (service as any).currentDatastore = createDatastore();
      await service.checkAndRebuildIfNeeded();
      
      const checksum = service.getLastChecksum();
      expect(checksum).toBeTruthy();
      expect(checksum!.length).toBe(64); // SHA-256 hex length
    });
  });

  describe('startSearchIndexMonitor helper', () => {
    it('should start monitoring and return stop function', () => {
      const stop = startSearchIndexMonitor(service, { intervalMs: 1000 });
      
      expect(service.isMonitoring()).toBe(true);
      
      stop();
      
      expect(service.isMonitoring()).toBe(false);
    });
  });
});
