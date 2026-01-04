export interface RefreshSignal {
  revisionId: number;
  ts: string; // ISO timestamp
  by: {
    memberId: string;
    displayName: string;
  };
}
