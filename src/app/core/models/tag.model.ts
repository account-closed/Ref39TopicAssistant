export interface Tag {
  id: string; // UUID
  name: string;
  searchKeywords?: string[];
  hinweise?: string; // Notes/tips
  copyPasteText?: string;
  color?: string; // Hex color code (e.g., '#FF5733')
  isSuperTag?: boolean; // Top-level tag
  isGvplTag?: boolean; // Geschäftsverteilungsplan (business distribution plan) tag
  /**
   * Optional weight for load calculation.
   * - null or missing → 0 (neutral)
   * - Negative values allowed
   * - Recommended range: -1.0 to +2.0
   * - TagWeight applies only through Topics
   */
  tagWeight?: number | null;
  createdAt: string; // ISO timestamp
  modifiedAt: string; // ISO timestamp
  createdBy: string; // Member ID who created the tag
}
