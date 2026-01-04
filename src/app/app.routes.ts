import { Routes } from '@angular/router';
import { SearchComponent } from './features/search/search.component';
import { QuickAssignmentComponent } from './features/quick-assignment/quick-assignment.component';
import { TopicsComponent } from './features/topics/topics.component';
import { MembersComponent } from './features/members/members.component';
import { TopicsByMemberComponent } from './features/topics-by-member/topics-by-member.component';
import { TagsComponent } from './features/tags/tags.component';
import { SettingsComponent } from './features/settings/settings.component';

export const routes: Routes = [
  { path: '', redirectTo: '/search', pathMatch: 'full' },
  { path: 'search', component: SearchComponent },
  { path: 'quick-assignment', component: QuickAssignmentComponent },
  { path: 'topics', component: TopicsComponent },
  { path: 'members', component: MembersComponent },
  { path: 'topics-by-member', component: TopicsByMemberComponent },
  { path: 'tags', component: TagsComponent },
  { path: 'settings', component: SettingsComponent },
];
