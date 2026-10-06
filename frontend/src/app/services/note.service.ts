import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Attachment {
  _id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface NoteVersion {
  _id: string;
  title: string;
  content: string;
  editedAt: string;
}

export interface Note {
  _id: string;
  title: string;
  content: string;
  isPublic: boolean;
  owner: { _id: string; name: string; email: string };
  sharedWith: { _id: string; name: string; email: string }[];
  attachments: Attachment[];
  tags: string[];
  folder: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteFilters {
  q?: string;
  tag?: string;
  folder?: string;
}

@Injectable({ providedIn: 'root' })
export class NoteService {
  private apiUrl = 'http://localhost:5000/api/notes';

  constructor(private http: HttpClient) {}

  getNotes(filters?: NoteFilters): Observable<Note[]> {
    let params = new HttpParams();
    if (filters?.q) params = params.set('q', filters.q);
    if (filters?.tag) params = params.set('tag', filters.tag);
    if (filters?.folder) params = params.set('folder', filters.folder);
    return this.http.get<Note[]>(this.apiUrl, { params });
  }

  getTagsAndFolders(): Observable<{ tags: string[]; folders: string[] }> {
    return this.http.get<{ tags: string[]; folders: string[] }>(`${this.apiUrl}/meta/tags-and-folders`);
  }

  getNote(id: string): Observable<Note> {
    return this.http.get<Note>(`${this.apiUrl}/${id}`);
  }

  createNote(formData: FormData): Observable<Note> {
    return this.http.post<Note>(this.apiUrl, formData);
  }

  updateNote(id: string, data: Partial<{ title: string; content: string; isPublic: boolean; tags: string[]; folder: string }>): Observable<Note> {
    return this.http.put<Note>(`${this.apiUrl}/${id}`, data);
  }

  deleteNote(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }

  shareNote(id: string, email: string): Observable<Note> {
    return this.http.post<Note>(`${this.apiUrl}/${id}/share`, { email });
  }

  uploadAttachments(noteId: string, files: FileList): Observable<Attachment[]> {
    const formData = new FormData();
    Array.from(files).forEach(f => formData.append('files', f));
    return this.http.post<Attachment[]>(`${this.apiUrl}/${noteId}/attachments`, formData);
  }

  downloadAttachment(noteId: string, attachmentId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${noteId}/attachments/${attachmentId}/download`, { responseType: 'blob' });
  }

  deleteAttachment(noteId: string, attachmentId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${noteId}/attachments/${attachmentId}`);
  }

  getVersions(noteId: string): Observable<NoteVersion[]> {
    return this.http.get<NoteVersion[]>(`${this.apiUrl}/${noteId}/versions`);
  }

  restoreVersion(noteId: string, versionId: string): Observable<Note> {
    return this.http.post<Note>(`${this.apiUrl}/${noteId}/versions/${versionId}/restore`, {});
  }
}
