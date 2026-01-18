import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { LoadConfigService, MAX_OVERHEAD_FACTOR } from './load-config.service';
import { FileConnectionService } from './file-connection.service';
import { LoadConfig, DEFAULT_LOAD_CONFIG, SizeLabel } from '../models';

// Mock FileConnectionService
const mockFileConnectionService = {
  getConnection: vi.fn(() => ({ directoryHandle: null, connected: false })),
  connection$: { subscribe: vi.fn() },
};

describe('LoadConfigService', () => {
  let service: LoadConfigService;
  let mockConfig: LoadConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        LoadConfigService,
        { provide: FileConnectionService, useValue: mockFileConnectionService }
      ]
    });
    service = TestBed.inject(LoadConfigService);
    // Deep clone default config
    mockConfig = JSON.parse(JSON.stringify(DEFAULT_LOAD_CONFIG));
  });

  describe('validateConfig', () => {
    it('should validate correct config', () => {
      const result = service.validateConfig(DEFAULT_LOAD_CONFIG);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject null config', () => {
      const result = service.validateConfig(null);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Config must be an object');
    });

    it('should reject invalid schemaVersion', () => {
      const config = { ...mockConfig, schemaVersion: 2 };
      const result = service.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('schemaVersion');
    });

    it('should reject negative contractHoursPerWeek', () => {
      const config = { ...mockConfig, capacity: { ...mockConfig.capacity, contractHoursPerWeek: -10 } };
      const result = service.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('contractHoursPerWeek'));
    });

    it(`should reject overheadFactor >= ${MAX_OVERHEAD_FACTOR}`, () => {
      const config = { ...mockConfig, capacity: { ...mockConfig.capacity, overheadFactor: MAX_OVERHEAD_FACTOR } };
      const result = service.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('overheadFactor'));
    });

    it('should reject negative alpha', () => {
      const config = { ...mockConfig, topicComplexity: { ...mockConfig.topicComplexity, alpha: -1 } };
      const result = service.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('alpha'));
    });

    it('should reject partTimeFactor > 1.0', () => {
      const config = { ...mockConfig, members: { partTimeFactors: { 'member-1': 1.5 } } };
      const result = service.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('partTimeFactor'));
    });

    it('should reject partTimeFactor <= 0', () => {
      const config = { ...mockConfig, members: { partTimeFactors: { 'member-1': 0 } } };
      const result = service.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('partTimeFactor'));
    });

    it('should accept valid partTimeFactor', () => {
      const config = { ...mockConfig, members: { partTimeFactors: { 'member-1': 0.8 } } };
      const result = service.validateConfig(config);
      expect(result.isValid).toBe(true);
    });
  });

  describe('calculateEffectiveFullTimeCapacity', () => {
    it('should calculate correctly with default values', () => {
      // 41 * (1 - 0.35) = 26.65
      const result = service.calculateEffectiveFullTimeCapacity(mockConfig);
      expect(result).toBeCloseTo(26.65, 2);
    });

    it('should calculate correctly with custom values', () => {
      mockConfig.capacity.contractHoursPerWeek = 40;
      mockConfig.capacity.overheadFactor = 0.25;
      // 40 * (1 - 0.25) = 30
      const result = service.calculateEffectiveFullTimeCapacity(mockConfig);
      expect(result).toBe(30);
    });
  });

  describe('getPartTimeFactor', () => {
    it('should return 1.0 for unknown member', () => {
      expect(service.getPartTimeFactor(mockConfig, 'unknown-member')).toBe(1.0);
    });

    it('should return configured factor', () => {
      mockConfig.members.partTimeFactors['member-1'] = 0.8;
      expect(service.getPartTimeFactor(mockConfig, 'member-1')).toBe(0.8);
    });
  });

  describe('calculateMemberEffectiveCapacity', () => {
    it('should return full capacity for full-time member', () => {
      const result = service.calculateMemberEffectiveCapacity(mockConfig, 'unknown');
      expect(result).toBeCloseTo(26.65, 2);
    });

    it('should return reduced capacity for part-time member', () => {
      mockConfig.members.partTimeFactors['part-time'] = 0.5;
      const result = service.calculateMemberEffectiveCapacity(mockConfig, 'part-time');
      // 26.65 * 0.5 = 13.325
      expect(result).toBeCloseTo(13.325, 2);
    });
  });

  describe('getMemberBaseLoad', () => {
    it('should return sum of enabled components for unknown member', () => {
      // JF (2.0) + Daily 1 (0.5) + Daily 2 (0.5) + Daily 3 (0.5) = 3.5
      const result = service.getMemberBaseLoad(mockConfig, 'unknown');
      expect(result).toBe(3.5);
    });

    it('should return override value if set', () => {
      mockConfig.baseLoad.memberOverrides['member-1'] = { hoursPerWeek: 5.0 };
      const result = service.getMemberBaseLoad(mockConfig, 'member-1');
      expect(result).toBe(5.0);
    });

    it('should exclude disabled components', () => {
      mockConfig.baseLoad.components[0].enabled = false; // Disable JF
      const result = service.getMemberBaseLoad(mockConfig, 'unknown');
      // Daily 1 (0.5) + Daily 2 (0.5) + Daily 3 (0.5) = 1.5
      expect(result).toBe(1.5);
    });
  });

  describe('classifySize', () => {
    it('should return XS for load < 2', () => {
      expect(service.classifySize(mockConfig, 0, 26.65)).toBe('XS');
      expect(service.classifySize(mockConfig, 1.9, 26.65)).toBe('XS');
    });

    it('should return S for load 2-8', () => {
      expect(service.classifySize(mockConfig, 2, 26.65)).toBe('S');
      expect(service.classifySize(mockConfig, 7.9, 26.65)).toBe('S');
    });

    it('should return M for load 8-14', () => {
      expect(service.classifySize(mockConfig, 8, 26.65)).toBe('M');
      expect(service.classifySize(mockConfig, 13.9, 26.65)).toBe('M');
    });

    it('should return L for load 14-20', () => {
      expect(service.classifySize(mockConfig, 14, 26.65)).toBe('L');
      expect(service.classifySize(mockConfig, 19.9, 26.65)).toBe('L');
    });

    it('should return XL for load >= 20 within capacity', () => {
      expect(service.classifySize(mockConfig, 20, 26.65)).toBe('XL');
      expect(service.classifySize(mockConfig, 26, 26.65)).toBe('XL');
    });

    it('should return XXL when load exceeds capacity', () => {
      expect(service.classifySize(mockConfig, 27, 26.65)).toBe('XXL');
      expect(service.classifySize(mockConfig, 50, 26.65)).toBe('XXL');
    });

    it('should return XXL for part-time member when load exceeds their capacity', () => {
      // Part-time capacity = 26.65 * 0.5 = 13.325
      expect(service.classifySize(mockConfig, 14, 13.325)).toBe('XXL');
    });
  });
});
