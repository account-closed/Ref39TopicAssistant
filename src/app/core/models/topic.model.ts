export interface TopicValidity {
  alwaysValid: boolean;
  validFrom?: string; // ISO date string
  validTo?: string; // ISO date string
}

export interface TopicRaci {
  r1MemberId?: string; // optional - topics without R1 are orphan topics
  r2MemberId?: string;
  r3MemberId?: string;
  cMemberIds: string[];
  iMemberIds: string[];
}

export type TShirtSize = 'XXS' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

export interface Topic {
  id: string; // UUID
  header: string;
  description?: string;
  tags?: string[];
  searchKeywords?: string[];
  validity: TopicValidity;
  notes?: string;
  raci: TopicRaci;
  updatedAt: string; // ISO timestamp
  priority?: number; // Star rating from 1 to 10
  hasFileNumber?: boolean; // "hat Aktenzeichen"
  fileNumber?: string; // File number, shown when hasFileNumber is true
  hasSharedFilePath?: boolean; // "hat Ablageort"
  sharedFilePath?: string; // Shared file path, shown when hasSharedFilePath is true
  size?: TShirtSize; // T-shirt size classification (XXS to XXL)
}
