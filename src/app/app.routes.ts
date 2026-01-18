import { Routes } from '@angular/router';
import { SearchComponent } from './features/search/search.component';
import { QuickAssignmentComponent } from './features/quick-assignment/quick-assignment.component';
import { TopicsComponent } from './features/topics/topics.component';
import { MembersComponent } from './features/members/members.component';
import { TopicsByMemberComponent } from './features/topics-by-member/topics-by-member.component';
import { TagsComponent } from './features/tags/tags.component';
import { SettingsComponent } from './features/settings/settings.component';
import { VisualizationsComponent } from './features/visualizations/visualizations.component';
import { SunburstComponent } from './features/visualizations/sunburst/sunburst.component';
import { NetworkDiagramComponent } from './features/visualizations/network-diagram/network-diagram.component';
import { TreemapComponent } from './features/visualizations/treemap/treemap.component';
import { LoadDashboardComponent } from './features/visualizations/load-dashboard/load-dashboard.component';
import { LoadConfigComponent } from './features/visualizations/load-config/load-config.component';

export const routes: Routes = [
  { path: '', redirectTo: '/search', pathMatch: 'full' },
  { path: 'search', component: SearchComponent },
  { path: 'quick-assignment', component: QuickAssignmentComponent },
  { path: 'topics', component: TopicsComponent },
  { path: 'members', component: MembersComponent },
  { path: 'topics-by-member', component: TopicsByMemberComponent },
  { path: 'tags', component: TagsComponent },
  { path: 'visualizations', component: VisualizationsComponent },
  { path: 'visualizations/sunburst', component: SunburstComponent },
  { path: 'visualizations/network', component: NetworkDiagramComponent },
  { path: 'visualizations/treemap', component: TreemapComponent },
  { path: 'visualizations/load', component: LoadDashboardComponent },
  { path: 'visualizations/load/config', component: LoadConfigComponent },
  { path: 'settings', component: SettingsComponent },
];
