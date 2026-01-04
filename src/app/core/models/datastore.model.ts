import { TeamMember } from './team-member.model';
import { Topic } from './topic.model';
import { Tag } from './tag.model';

export interface Datastore {
  schemaVersion: number;
  generatedAt: string; // ISO timestamp
  revisionId: number;
  members: TeamMember[];
  topics: Topic[];
  tags?: Tag[]; // Managed tags
}
