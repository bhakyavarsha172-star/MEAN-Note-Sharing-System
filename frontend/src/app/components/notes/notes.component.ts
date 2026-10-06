import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { NoteService, Note } from '../../services/note.service';
import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-notes',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './notes.component.html'
})
export class NotesComponent implements OnInit, OnDestroy {
  notes: Note[] = [];
  error = '';
  userId = '';
  liveUpdateNotice = '';

  searchTerm = '';
  selectedTag = '';
  selectedFolder = '';
  availableTags: string[] = [];
  availableFolders: string[] = [];

  private sub = new Subscription();
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private noteService: NoteService,
    private auth: AuthService,
    private router: Router,
    private socket: SocketService,
    public theme: ThemeService
  ) {}

  ngOnInit() {
    this.userId = this.auth.getUser()?.id || '';
    this.load();
    this.loadMeta();

    // Any create/update/delete/share by this user or a collaborator refreshes the list live,
    // so multiple people working at once always see current state without reloading the page.
    this.sub.add(this.socket.noteListChanged$.subscribe(({ event }) => {
      this.load();
      this.loadMeta();
      if (event === 'shared') this.flashNotice('A note was just shared with you.');
      if (event === 'updated') this.flashNotice('A note was just updated.');
    }));
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  private flashNotice(msg: string) {
    this.liveUpdateNotice = msg;
    setTimeout(() => this.liveUpdateNotice = '', 3000);
  }

  load() {
    this.noteService.getNotes({ q: this.searchTerm, tag: this.selectedTag, folder: this.selectedFolder }).subscribe({
      next: (notes) => this.notes = notes,
      error: (err) => this.error = err.error?.message || 'Failed to load notes'
    });
  }

  loadMeta() {
    this.noteService.getTagsAndFolders().subscribe({
      next: (meta) => { this.availableTags = meta.tags; this.availableFolders = meta.folders; },
      error: () => {}
    });
  }

  onSearchChange() {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.load(), 300);
  }

  onFilterChange() {
    this.load();
  }

  isOwner(note: Note): boolean {
    return note.owner._id === this.userId;
  }

  deleteNote(id: string) {
    if (!confirm('Delete this note?')) return;
    this.noteService.deleteNote(id).subscribe({
      next: () => this.load(),
      error: (err) => this.error = err.error?.message || 'Failed to delete note'
    });
  }

  shareNote(note: Note) {
    const email = prompt(`Share "${note.title}" with (email):`);
    if (!email) return;
    this.noteService.shareNote(note._id, email).subscribe({
      next: () => this.load(),
      error: (err) => alert(err.error?.message || 'Failed to share note')
    });
  }

  logout() {
    this.socket.disconnect();
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
