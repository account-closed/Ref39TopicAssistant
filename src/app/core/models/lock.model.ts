export interface LockHolder {
  memberId: string; // UUID
  displayName: string;
}

export type LockPurpose = 'topic-save' | 'member-save' | 'assignment-save' | 'tag-save';

export interface Lock {
  lockedAt: string; // ISO timestamp (UTC)
  ttlSeconds: number; // 120
  lockedBy: LockHolder;
  clientId: string; // UUID
  purpose: LockPurpose;
}
