/**
 * Type of change event for notifications.
 */
export type ChangeEventType = 'create' | 'update' | 'delete';

/**
 * Entity type for change notifications.
 */
export type EntityType = 'topic' | 'tag' | 'member';

/**
 * Change event for notifying clients about data changes.
 * This is returned by the backend to inform clients about
 * specific changes so they can update incrementally.
 */
export interface ChangeEvent {
  entityType: EntityType;
  entityId: string;
  eventType: ChangeEventType;
  revisionId: number;
  timestamp: string; // ISO 8601
  byMemberId?: string;
}

/**
 * Response containing change events since a given revision.
 */
export interface ChangesResponse {
  changes: ChangeEvent[];
  currentRevision: number;
}
