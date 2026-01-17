import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { WriteQueueService, QueuedOperation } from './write-queue.service';
import { DatastoreCommitService } from './datastore-commit.service';
import { Datastore, Topic, TeamMember, Tag } from '../models';

// Mock DatastoreCommitService
const mockCommitService = {
  commitChanges: vi.fn(),
  getDatastore: vi.fn()
};

const createMember = (id: string, name: string): TeamMember => ({
  id,
  displayName: name,
  active: true,
  updatedAt: new Date().toISOString(),
});

const createTag = (id: string, name: string): Tag => ({
  id,
  name,
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  createdBy: 'test-user',
});

const createTopic = (id: string, header: string, r1MemberId: string): Topic => ({
  id,
  header,
  validity: { alwaysValid: true },
  raci: {
    r1MemberId,
    cMemberIds: [],
    iMemberIds: [],
  },
  updatedAt: new Date().toISOString(),
});

const createDatastore = (): Datastore => ({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  revisionId: 1,
  members: [createMember('member-1', 'Test User')],
  topics: [],
  tags: [],
});

describe('WriteQueueService', () => {
  let service: WriteQueueService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        WriteQueueService,
        { provide: DatastoreCommitService, useValue: mockCommitService }
      ]
    });

    service = TestBed.inject(WriteQueueService);
    vi.clearAllMocks();
  });

  describe('Queue Operations', () => {
    it('should queue add topic operation', () => {
      const topic = createTopic('topic-1', 'Test Topic', 'member-1');
      
      service.queueAddTopic(topic);
      
      expect(service.queuedOperations().length).toBe(1);
      expect(service.queuedOperations()[0].type).toBe('add-topic');
      expect(service.queuedOperations()[0].payload).toEqual(topic);
      expect(service.queuedOperations()[0].description).toContain('Test Topic');
    });

    it('should queue update topic operation', () => {
      const updates = { header: 'Updated Header' };
      
      service.queueUpdateTopic('topic-1', updates);
      
      expect(service.queuedOperations().length).toBe(1);
      expect(service.queuedOperations()[0].type).toBe('update-topic');
      expect(service.queuedOperations()[0].payload).toEqual({ topicId: 'topic-1', updates });
    });

    it('should queue delete topic operation', () => {
      service.queueDeleteTopic('topic-1');
      
      expect(service.queuedOperations().length).toBe(1);
      expect(service.queuedOperations()[0].type).toBe('delete-topic');
      expect(service.queuedOperations()[0].payload).toEqual({ topicId: 'topic-1' });
    });

    it('should queue add member operation', () => {
      const member = createMember('member-2', 'New Member');
      
      service.queueAddMember(member);
      
      expect(service.queuedOperations().length).toBe(1);
      expect(service.queuedOperations()[0].type).toBe('add-member');
      expect(service.queuedOperations()[0].payload).toEqual(member);
    });

    it('should queue update member operation', () => {
      const updates = { displayName: 'Updated Name' };
      
      service.queueUpdateMember('member-1', updates);
      
      expect(service.queuedOperations().length).toBe(1);
      expect(service.queuedOperations()[0].type).toBe('update-member');
    });

    it('should queue delete member operation', () => {
      service.queueDeleteMember('member-1');
      
      expect(service.queuedOperations().length).toBe(1);
      expect(service.queuedOperations()[0].type).toBe('delete-member');
    });

    it('should queue add tag operation', () => {
      const tag = createTag('tag-1', 'New Tag');
      
      service.queueAddTag(tag);
      
      expect(service.queuedOperations().length).toBe(1);
      expect(service.queuedOperations()[0].type).toBe('add-tag');
    });

    it('should queue update tag operation', () => {
      const updates = { name: 'Updated Tag' };
      
      service.queueUpdateTag('tag-1', updates);
      
      expect(service.queuedOperations().length).toBe(1);
      expect(service.queuedOperations()[0].type).toBe('update-tag');
    });

    it('should queue delete tag operation', () => {
      service.queueDeleteTag('tag-1');
      
      expect(service.queuedOperations().length).toBe(1);
      expect(service.queuedOperations()[0].type).toBe('delete-tag');
    });

    it('should queue update multiple topics operation', () => {
      const updates = [
        { topicId: 'topic-1', changes: { header: 'New Header 1' } },
        { topicId: 'topic-2', changes: { header: 'New Header 2' } }
      ];
      
      service.queueUpdateMultipleTopics(updates);
      
      expect(service.queuedOperations().length).toBe(1);
      expect(service.queuedOperations()[0].type).toBe('update-multiple-topics');
      expect(service.queuedOperations()[0].payload).toEqual(updates);
    });

    it('should generate unique IDs for each operation', () => {
      service.queueAddTopic(createTopic('topic-1', 'Topic 1', 'member-1'));
      service.queueAddTopic(createTopic('topic-2', 'Topic 2', 'member-1'));
      
      const ops = service.queuedOperations();
      expect(ops[0].id).not.toBe(ops[1].id);
    });

    it('should set timestamps for operations', () => {
      const beforeTime = new Date().toISOString();
      service.queueAddTopic(createTopic('topic-1', 'Topic 1', 'member-1'));
      const afterTime = new Date().toISOString();
      
      const timestamp = service.queuedOperations()[0].timestamp;
      expect(timestamp >= beforeTime && timestamp <= afterTime).toBe(true);
    });
  });

  describe('Computed Signals', () => {
    it('should compute hasUnsavedChanges correctly', () => {
      expect(service.hasUnsavedChanges()).toBe(false);
      
      service.queueAddTopic(createTopic('topic-1', 'Topic 1', 'member-1'));
      expect(service.hasUnsavedChanges()).toBe(true);
      
      service.clearQueue();
      expect(service.hasUnsavedChanges()).toBe(false);
    });

    it('should compute pendingChangesCount correctly', () => {
      expect(service.pendingChangesCount()).toBe(0);
      
      service.queueAddTopic(createTopic('topic-1', 'Topic 1', 'member-1'));
      expect(service.pendingChangesCount()).toBe(1);
      
      service.queueUpdateTopic('topic-1', { header: 'Updated' });
      expect(service.pendingChangesCount()).toBe(2);
      
      service.clearQueue();
      expect(service.pendingChangesCount()).toBe(0);
    });
  });

  describe('Clear Queue', () => {
    it('should clear all pending operations', () => {
      service.queueAddTopic(createTopic('topic-1', 'Topic 1', 'member-1'));
      service.queueAddTopic(createTopic('topic-2', 'Topic 2', 'member-1'));
      service.queueAddMember(createMember('member-2', 'Member 2'));
      
      expect(service.queuedOperations().length).toBe(3);
      
      service.clearQueue();
      
      expect(service.queuedOperations().length).toBe(0);
      expect(service.hasUnsavedChanges()).toBe(false);
    });
  });

  describe('Save Now', () => {
    it('should return success when no operations are queued', async () => {
      const result = await service.saveNow();
      
      expect(result.success).toBe(true);
      expect(result.savedOperationsCount).toBe(0);
      expect(result.consolidatedOperationsCount).toBe(0);
      expect(result.germanMessage).toContain('Keine ausstehenden Änderungen');
      expect(mockCommitService.commitChanges).not.toHaveBeenCalled();
    });

    it('should prevent concurrent saves', async () => {
      service.queueAddTopic(createTopic('topic-1', 'Topic 1', 'member-1'));
      
      // Mock commitChanges to simulate a slow save
      mockCommitService.commitChanges.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
      );
      
      const promise1 = service.saveNow();
      const promise2 = service.saveNow(); // Should fail immediately
      
      const result2 = await promise2;
      expect(result2.success).toBe(false);
      expect(result2.germanMessage).toContain('läuft bereits');
      
      await promise1;
    });

    it('should call commitChanges with correct lock purpose for topics', async () => {
      service.queueAddTopic(createTopic('topic-1', 'Topic 1', 'member-1'));
      
      mockCommitService.commitChanges.mockResolvedValue({ success: true });
      
      await service.saveNow();
      
      expect(mockCommitService.commitChanges).toHaveBeenCalledWith(
        expect.any(Function),
        'topic-save'
      );
    });

    it('should call commitChanges with correct lock purpose for members', async () => {
      service.queueAddMember(createMember('member-2', 'Member 2'));
      
      mockCommitService.commitChanges.mockResolvedValue({ success: true });
      
      await service.saveNow();
      
      expect(mockCommitService.commitChanges).toHaveBeenCalledWith(
        expect.any(Function),
        'member-save'
      );
    });

    it('should call commitChanges with correct lock purpose for tags', async () => {
      service.queueAddTag(createTag('tag-1', 'Tag 1'));
      
      mockCommitService.commitChanges.mockResolvedValue({ success: true });
      
      await service.saveNow();
      
      expect(mockCommitService.commitChanges).toHaveBeenCalledWith(
        expect.any(Function),
        'tag-save'
      );
    });

    it('should call commitChanges with assignment-save for multiple topics', async () => {
      service.queueUpdateMultipleTopics([
        { topicId: 'topic-1', changes: { header: 'New 1' } }
      ]);
      
      mockCommitService.commitChanges.mockResolvedValue({ success: true });
      
      await service.saveNow();
      
      expect(mockCommitService.commitChanges).toHaveBeenCalledWith(
        expect.any(Function),
        'assignment-save'
      );
    });

    it('should clear queue on successful save', async () => {
      service.queueAddTopic(createTopic('topic-1', 'Topic 1', 'member-1'));
      service.queueAddTopic(createTopic('topic-2', 'Topic 2', 'member-1'));
      
      mockCommitService.commitChanges.mockResolvedValue({ success: true });
      
      await service.saveNow();
      
      expect(service.queuedOperations().length).toBe(0);
      expect(service.hasUnsavedChanges()).toBe(false);
    });

    it('should update lastSaveTime on successful save', async () => {
      service.queueAddTopic(createTopic('topic-1', 'Topic 1', 'member-1'));
      
      expect(service.lastSaveTime()).toBeNull();
      
      mockCommitService.commitChanges.mockResolvedValue({ success: true });
      
      const beforeSave = new Date().toISOString();
      await service.saveNow();
      const afterSave = new Date().toISOString();
      
      const lastSave = service.lastSaveTime();
      expect(lastSave).not.toBeNull();
      expect(lastSave! >= beforeSave && lastSave! <= afterSave).toBe(true);
    });

    it('should not clear queue on failed save', async () => {
      service.queueAddTopic(createTopic('topic-1', 'Topic 1', 'member-1'));
      
      mockCommitService.commitChanges.mockResolvedValue({ 
        success: false,
        germanMessage: 'Save failed'
      });
      
      await service.saveNow();
      
      expect(service.queuedOperations().length).toBe(1);
      expect(service.hasUnsavedChanges()).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      service.queueAddTopic(createTopic('topic-1', 'Topic 1', 'member-1'));
      
      mockCommitService.commitChanges.mockRejectedValue(new Error('Network error'));
      
      const result = await service.saveNow();
      
      expect(result.success).toBe(false);
      expect(result.germanMessage).toContain('Fehler beim Speichern');
      expect(service.queuedOperations().length).toBe(1); // Queue not cleared
    });
  });

  describe('Operation Consolidation', () => {
    it('should consolidate multiple updates to same topic', async () => {
      service.queueUpdateTopic('topic-1', { header: 'Update 1' });
      service.queueUpdateTopic('topic-1', { description: 'Update 2' });
      service.queueUpdateTopic('topic-1', { notes: 'Update 3' });
      
      mockCommitService.commitChanges.mockResolvedValue({ success: true });
      
      const result = await service.saveNow();
      
      expect(result.savedOperationsCount).toBe(3);
      expect(result.consolidatedOperationsCount).toBe(1);
    });

    it('should remove add + delete for same entity', async () => {
      const topic = createTopic('topic-1', 'Topic 1', 'member-1');
      service.queueAddTopic(topic);
      service.queueDeleteTopic('topic-1');
      
      mockCommitService.commitChanges.mockResolvedValue({ success: true });
      
      const result = await service.saveNow();
      
      expect(result.savedOperationsCount).toBe(2);
      expect(result.consolidatedOperationsCount).toBe(0); // Both removed
    });

    it('should consolidate update + delete to just delete', async () => {
      service.queueUpdateTopic('topic-1', { header: 'Updated' });
      service.queueDeleteTopic('topic-1');
      
      mockCommitService.commitChanges.mockResolvedValue({ success: true });
      
      const result = await service.saveNow();
      
      expect(result.savedOperationsCount).toBe(2);
      expect(result.consolidatedOperationsCount).toBe(1);
    });

    it('should consolidate add + update to single add', async () => {
      const topic = createTopic('topic-1', 'Original', 'member-1');
      service.queueAddTopic(topic);
      service.queueUpdateTopic('topic-1', { header: 'Updated Header' });
      service.queueUpdateTopic('topic-1', { description: 'New Description' });
      
      mockCommitService.commitChanges.mockResolvedValue({ success: true });
      
      const result = await service.saveNow();
      
      expect(result.savedOperationsCount).toBe(3);
      expect(result.consolidatedOperationsCount).toBe(1);
    });

    it('should keep delete + add as separate operations for data integrity', async () => {
      service.queueDeleteTopic('topic-1');
      const newTopic = createTopic('topic-1', 'New Topic', 'member-1');
      service.queueAddTopic(newTopic);
      
      mockCommitService.commitChanges.mockResolvedValue({ success: true });
      
      const result = await service.saveNow();
      
      expect(result.savedOperationsCount).toBe(2);
      // Both operations are preserved for data integrity
      expect(result.consolidatedOperationsCount).toBe(2);
    });

    it('should not consolidate operations for different entities', async () => {
      service.queueAddTopic(createTopic('topic-1', 'Topic 1', 'member-1'));
      service.queueAddTopic(createTopic('topic-2', 'Topic 2', 'member-1'));
      service.queueAddMember(createMember('member-2', 'Member 2'));
      
      mockCommitService.commitChanges.mockResolvedValue({ success: true });
      
      const result = await service.saveNow();
      
      expect(result.savedOperationsCount).toBe(3);
      expect(result.consolidatedOperationsCount).toBe(3); // No consolidation
    });

    it('should keep update-multiple-topics operations separate', async () => {
      service.queueUpdateMultipleTopics([
        { topicId: 'topic-1', changes: { header: 'New 1' } }
      ]);
      service.queueUpdateTopic('topic-2', { header: 'New 2' });
      
      mockCommitService.commitChanges.mockResolvedValue({ success: true });
      
      const result = await service.saveNow();
      
      expect(result.consolidatedOperationsCount).toBe(2);
    });
  });

  describe('Signal Reactivity', () => {
    it('should update hasUnsavedChanges signal when queue changes', () => {
      expect(service.hasUnsavedChanges()).toBe(false);
      
      service.queueAddTopic(createTopic('topic-1', 'Topic', 'member-1'));
      expect(service.hasUnsavedChanges()).toBe(true);
      
      service.clearQueue();
      expect(service.hasUnsavedChanges()).toBe(false);
    });

    it('should update pendingChangesCount signal when queue changes', () => {
      expect(service.pendingChangesCount()).toBe(0);
      
      service.queueAddTopic(createTopic('topic-1', 'Topic 1', 'member-1'));
      expect(service.pendingChangesCount()).toBe(1);
      
      service.queueAddTopic(createTopic('topic-2', 'Topic 2', 'member-1'));
      expect(service.pendingChangesCount()).toBe(2);
      
      service.clearQueue();
      expect(service.pendingChangesCount()).toBe(0);
    });

    it('should update isSaving signal during save operation', async () => {
      service.queueAddTopic(createTopic('topic-1', 'Topic', 'member-1'));
      
      let savingDuringCommit = false;
      mockCommitService.commitChanges.mockImplementation(async () => {
        savingDuringCommit = service.isSaving();
        return { success: true };
      });
      
      expect(service.isSaving()).toBe(false);
      
      await service.saveNow();
      
      expect(savingDuringCommit).toBe(true);
      expect(service.isSaving()).toBe(false);
    });
  });
});
