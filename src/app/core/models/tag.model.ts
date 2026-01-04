export interface Tag {
  id: string; // UUID
  name: string;
  searchKeywords?: string[];
  hinweise?: string; // Notes/tips
  copyPasteText?: string;
  createdAt: string; // ISO timestamp
  modifiedAt: string; // ISO timestamp
  createdBy: string; // Member ID who created the tag
}
