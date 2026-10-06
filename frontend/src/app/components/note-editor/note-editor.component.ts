import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { NoteService, Note, Attachment, NoteVersion } from '../../services/note.service';
import { AuthService, RegisteredUser } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';
import { RichTextEditorComponent } from '../rich-text-editor/rich-text-editor.component';

@Component({
  selector: 'app-note-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RichTextEditorComponent],
  templateUrl: './note-editor.component.html'
})
export class NoteEditorComponent implements OnInit, OnDestroy {
  noteId: string | null = null;
  title = '';
  content = '';
  isPublic = false;
  isOwner = true;
  note: Note | null = null;
  error = '';
  saving = false;
  uploading = false;

  // --- Organization ---
  tagsInput = '';   // comma-separated, as typed
  folder = '';

  // --- Recipient selection (only used when creating a brand-new note) ---
  allUsers: RegisteredUser[] = [];
  shareWithAll = false;
  selectedUserIds: string[] = [];

  // Files picked before the note exists yet (sent together with the create request)
  pendingFiles: File[] = [];

  viewerCount = 0;       // other people currently viewing this note
  liveEditNotice = '';   // brief "X is editing" flash

  // --- Version history ---
  versions: NoteVersion[] = [];
  showVersions = false;
  previewVersion: NoteVersion | null = null;
  restoring = false;

  private sub = new Subscription();
  private editDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private noteService: NoteService,
    private auth: AuthService,
    private socket: SocketService
  ) {}

  get isNew(): boolean {
    return !this.noteId || this.noteId === 'new';
  }

  ngOnInit() {
    this.noteId = this.route.snapshot.paramMap.get('id');

    if (this.isNew) {
      this.auth.getUsers().subscribe({
        next: (users) => this.allUsers = users,
        error: () => {} // recipient list is a nice-to-have; don't block note creation on it
      });
      return;
    }

    this.loadNote(this.noteId!);
    this.socket.joinNote(this.noteId!);

    this.sub.add(this.socket.presence$.subscribe(p => {
      this.viewerCount = Math.max(0, this.viewerCount + (p.event === 'joined' ? 1 : -1));
    }));

    // Someone else typing in this note right now — merge their content live
    this.sub.add(this.socket.noteLiveEdit$.subscribe(p => {
      if (p.noteId !== this.noteId) return;
      this.title = p.title;
      this.content = p.content;
      this.liveEditNotice = 'Another collaborator is editing…';
      setTimeout(() => this.liveEditNotice = '', 2000);
    }));

    // Owner saved the note while you were viewing it
    this.sub.add(this.socket.noteSaved$.subscribe(p => {
      if (p.noteId !== this.noteId) return;
      this.title = p.title;
      this.content = p.content;
    }));
  }

  ngOnDestroy() {
    if (!this.isNew) this.socket.leaveNote(this.noteId!);
    this.sub.unsubscribe();
    if (this.editDebounce) clearTimeout(this.editDebounce);
  }

  loadNote(id: string) {
    this.noteService.getNote(id).subscribe({
      next: (note) => {
        this.note = note;
        this.title = note.title;
        this.content = note.content;
        this.isPublic = note.isPublic;
        this.tagsInput = (note.tags || []).join(', ');
        this.folder = note.folder || '';
        this.isOwner = note.owner._id === this.auth.getUser()?.id;
      },
      error: (err) => this.error = err.error?.message || 'Failed to load note'
    });
  }

  toggleRecipient(userId: string, checked: boolean) {
    if (checked) {
      if (!this.selectedUserIds.includes(userId)) this.selectedUserIds.push(userId);
    } else {
      this.selectedUserIds = this.selectedUserIds.filter(id => id !== userId);
    }
  }

  private parsedTags(): string[] {
    return this.tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 15);
  }

  // Called on every keystroke by the owner of an existing note — broadcasts live to viewers
  onTyping() {
    if (this.isNew || !this.isOwner) return;
    if (this.editDebounce) clearTimeout(this.editDebounce);
    this.editDebounce = setTimeout(() => {
      this.socket.sendEdit(this.noteId!, this.title, this.content);
    }, 300);
  }

  onContentChange(html: string) {
    this.content = html;
    this.onTyping();
  }

  // File picker: new note -> queue locally; existing note -> upload immediately
  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    if (this.isNew) {
      this.pendingFiles = [...this.pendingFiles, ...Array.from(input.files)].slice(0, 5);
      input.value = '';
      return;
    }

    this.uploading = true;
    this.noteService.uploadAttachments(this.noteId!, input.files).subscribe({
      next: () => { this.uploading = false; this.loadNote(this.noteId!); input.value = ''; },
      error: (err) => { this.error = err.error?.message || 'Upload failed'; this.uploading = false; }
    });
  }

  removePendingFile(file: File) {
    this.pendingFiles = this.pendingFiles.filter(f => f !== file);
  }

  save() {
    this.error = '';
    this.saving = true;
    const tags = this.parsedTags();

    if (this.isNew) {
      const formData = new FormData();
      formData.append('title', this.title);
      formData.append('content', this.content);
      formData.append('isPublic', String(this.isPublic));
      formData.append('shareWithAll', String(this.shareWithAll));
      formData.append('tags', JSON.stringify(tags));
      formData.append('folder', this.folder.trim());
      if (!this.shareWithAll) formData.append('shareWith', JSON.stringify(this.selectedUserIds));
      this.pendingFiles.forEach(f => formData.append('files', f));

      this.noteService.createNote(formData).subscribe({
        next: () => this.router.navigate(['/notes']),
        error: (err) => { this.error = err.error?.message || 'Failed to create note'; this.saving = false; }
      });
      return;
    }

    const payload = { title: this.title, content: this.content, isPublic: this.isPublic, tags, folder: this.folder.trim() };
    this.noteService.updateNote(this.noteId!, payload).subscribe({
      next: () => this.router.navigate(['/notes']),
      error: (err) => { this.error = err.error?.message || 'Failed to save note'; this.saving = false; }
    });
  }

  download(att: Attachment) {
    this.noteService.downloadAttachment(this.noteId!, att._id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = att.originalName;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => this.error = 'Download failed'
    });
  }

  removeAttachment(att: Attachment) {
    if (!confirm(`Remove "${att.originalName}"?`)) return;
    this.noteService.deleteAttachment(this.noteId!, att._id).subscribe({
      next: () => this.loadNote(this.noteId!),
      error: () => this.error = 'Failed to remove attachment'
    });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  toggleVersions() {
    this.showVersions = !this.showVersions;
    if (this.showVersions && this.versions.length === 0 && this.noteId) {
      this.noteService.getVersions(this.noteId).subscribe({
        next: (v) => this.versions = v,
        error: () => this.error = 'Failed to load version history'
      });
    }
  }

  viewVersion(v: NoteVersion) {
    this.previewVersion = this.previewVersion?._id === v._id ? null : v;
  }

  restoreVersion(v: NoteVersion) {
    if (!this.noteId || !confirm('Restore this version? Your current content will be saved to history first.')) return;
    this.restoring = true;
    this.noteService.restoreVersion(this.noteId, v._id).subscribe({
      next: () => {
        this.restoring = false;
        this.previewVersion = null;
        this.loadNote(this.noteId!);
        this.noteService.getVersions(this.noteId!).subscribe(versions => this.versions = versions);
      },
      error: () => { this.error = 'Failed to restore version'; this.restoring = false; }
    });
  }
}
