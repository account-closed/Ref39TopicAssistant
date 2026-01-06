export interface Tag {
  id: string; // UUID
  name: string;
  searchKeywords?: string[];
  hinweise?: string; // Notes/tips
  copyPasteText?: string;
  color?: string; // Hex color code (e.g., '#FF5733')
  isSuperTag?: boolean; // Top-level tag
  isGvplTag?: boolean; // Geschäftsverteilungsplan (business distribution plan) tag
  createdAt: string; // ISO timestamp
  modifiedAt: string; // ISO timestamp
  createdBy: string; // Member ID who created the tag
}
