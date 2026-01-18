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
import { connectionGuard } from './core/guards/connection.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/search', pathMatch: 'full' },
  // Public routes (accessible when not connected)
  { path: 'search', component: SearchComponent },
  { path: 'settings', component: SettingsComponent },
  // Protected routes (require connection)
  { path: 'quick-assignment', component: QuickAssignmentComponent, canActivate: [connectionGuard] },
  { path: 'topics', component: TopicsComponent, canActivate: [connectionGuard] },
  { path: 'members', component: MembersComponent, canActivate: [connectionGuard] },
  { path: 'topics-by-member', component: TopicsByMemberComponent, canActivate: [connectionGuard] },
  { path: 'tags', component: TagsComponent, canActivate: [connectionGuard] },
  { path: 'visualizations', component: VisualizationsComponent, canActivate: [connectionGuard] },
  { path: 'visualizations/sunburst', component: SunburstComponent, canActivate: [connectionGuard] },
  { path: 'visualizations/network', component: NetworkDiagramComponent, canActivate: [connectionGuard] },
  { path: 'visualizations/treemap', component: TreemapComponent, canActivate: [connectionGuard] },
  { path: 'visualizations/load', component: LoadDashboardComponent, canActivate: [connectionGuard] },
  { path: 'visualizations/load/config', component: LoadConfigComponent, canActivate: [connectionGuard] },
];
