export interface TeamMember {
  id: string; // UUID
  displayName: string;
  email?: string;
  active: boolean;
  tags?: string[];
  color?: string; // Hex color code (e.g., '#FF5733')
  updatedAt: string; // ISO timestamp
  
  // Load configuration (optional, stored per member)
  /** Part-time factor: 1.0 = full-time, 0.8 = 80%, etc. Range: (0, 1] */
  partTimeFactor?: number;
  /** Individual base load override in hours/week. If null/undefined, uses global default. */
  baseLoadOverride?: number | null;
}
