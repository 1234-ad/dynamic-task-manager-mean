import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { GuestGuard } from './guards/guest.guard';

import { LoginComponent } from './components/auth/login/login.component';
import { RegisterComponent } from './components/auth/register/register.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { TaskListComponent } from './components/tasks/task-list/task-list.component';
import { TaskDetailComponent } from './components/tasks/task-detail/task-detail.component';
import { ProjectListComponent } from './components/projects/project-list/project-list.component';
import { ProjectDetailComponent } from './components/projects/project-detail/project-detail.component';
import { ProfileComponent } from './components/profile/profile.component';

const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  
  // Auth routes (guest only)
  { 
    path: 'login', 
    component: LoginComponent, 
    canActivate: [GuestGuard],
    data: { title: 'Login' }
  },
  { 
    path: 'register', 
    component: RegisterComponent, 
    canActivate: [GuestGuard],
    data: { title: 'Register' }
  },
  
  // Protected routes
  { 
    path: 'dashboard', 
    component: DashboardComponent, 
    canActivate: [AuthGuard],
    data: { title: 'Dashboard' }
  },
  { 
    path: 'tasks', 
    component: TaskListComponent, 
    canActivate: [AuthGuard],
    data: { title: 'Tasks' }
  },
  { 
    path: 'tasks/:id', 
    component: TaskDetailComponent, 
    canActivate: [AuthGuard],
    data: { title: 'Task Details' }
  },
  { 
    path: 'projects', 
    component: ProjectListComponent, 
    canActivate: [AuthGuard],
    data: { title: 'Projects' }
  },
  { 
    path: 'projects/:id', 
    component: ProjectDetailComponent, 
    canActivate: [AuthGuard],
    data: { title: 'Project Details' }
  },
  { 
    path: 'profile', 
    component: ProfileComponent, 
    canActivate: [AuthGuard],
    data: { title: 'Profile' }
  },
  
  // Wildcard route
  { path: '**', redirectTo: '/dashboard' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    enableTracing: false, // Set to true for debugging
    scrollPositionRestoration: 'top'
  })],
  exports: [RouterModule]
})
export class AppRoutingModule { }