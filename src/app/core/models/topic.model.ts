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
}
