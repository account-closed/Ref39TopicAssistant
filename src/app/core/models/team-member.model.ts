export interface TeamMember {
  id: string; // UUID
  displayName: string;
  email?: string;
  active: boolean;
  tags?: string[];
  color?: string; // Hex color code (e.g., '#FF5733')
  updatedAt: string; // ISO timestamp
}
