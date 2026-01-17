export interface TopicValidity {
  alwaysValid: boolean;
  validFrom?: string; // ISO date string
  validTo?: string; // ISO date string
}

export interface TopicRaci {
  r1MemberId: string; // required
  r2MemberId?: string;
  r3MemberId?: string;
  cMemberIds: string[];
  iMemberIds: string[];
}

export type TShirtSize = 'XXS' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

/**
 * Type of connection between two topics.
 * - dependsOn: This topic depends on another topic
 * - blocks: This topic blocks another topic
 * - relatedTo: This topic is related to another topic (general connection)
 */
export type TopicConnectionType = 'dependsOn' | 'blocks' | 'relatedTo';

/**
 * Represents a connection from one topic to another.
 */
export interface TopicConnection {
  targetTopicId: string; // UUID of the connected topic
  type: TopicConnectionType;
}

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
  connections?: TopicConnection[]; // Connections to other topics
}
