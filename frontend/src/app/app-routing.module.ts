import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { RegisterComponent } from './components/register/register.component';
import { NotesComponent } from './components/notes/notes.component';
import { NoteEditorComponent } from './components/note-editor/note-editor.component';
import { AuthGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'notes', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'notes', component: NotesComponent, canActivate: [AuthGuard] },
  { path: 'notes/:id', component: NoteEditorComponent, canActivate: [AuthGuard] },
  { path: '**', redirectTo: 'notes' }
];
