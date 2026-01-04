export interface TeamMember {
  id: string; // UUID
  displayName: string;
  email?: string;
  active: boolean;
  tags?: string[];
  updatedAt: string; // ISO timestamp
}
