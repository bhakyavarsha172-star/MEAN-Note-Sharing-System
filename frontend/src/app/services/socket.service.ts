import { Injectable, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {
  private socket: Socket | null = null;

  // Fired when any note you own or that's shared with you changes elsewhere (any device/user)
  noteListChanged$ = new Subject<{ event: string; noteId: string }>();

  // Fired when someone else viewing the same note types (live co-editing)
  noteLiveEdit$ = new Subject<{ noteId: string; title: string; content: string; fromUserId: string }>();

  // Fired when a note is saved by its owner while you're viewing it
  noteSaved$ = new Subject<{ noteId: string; title: string; content: string }>();

  // Fired when someone joins/leaves the note you're currently viewing
  presence$ = new Subject<{ userId: string; event: 'joined' | 'left' }>();

  constructor(private auth: AuthService) {}

  connect() {
    if (this.socket?.connected) return;
    const token = this.auth.getToken();
    if (!token) return;

    this.socket = io('http://localhost:5000', { auth: { token } });

    this.socket.on('note:created', (p) => this.noteListChanged$.next({ event: 'created', noteId: p.noteId }));
    this.socket.on('note:updated', (p) => this.noteListChanged$.next({ event: 'updated', noteId: p.noteId }));
    this.socket.on('note:deleted', (p) => this.noteListChanged$.next({ event: 'deleted', noteId: p.noteId }));
    this.socket.on('note:shared', (p) => this.noteListChanged$.next({ event: 'shared', noteId: p.noteId }));
    this.socket.on('note:edit', (p) => this.noteLiveEdit$.next(p));
    this.socket.on('note:saved', (p) => this.noteSaved$.next(p));
    this.socket.on('note:presence', (p) => this.presence$.next(p));
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  joinNote(noteId: string) {
    this.socket?.emit('note:join', noteId);
  }

  leaveNote(noteId: string) {
    this.socket?.emit('note:leave', noteId);
  }

  sendEdit(noteId: string, title: string, content: string) {
    this.socket?.emit('note:edit', { noteId, title, content });
  }

  ngOnDestroy() {
    this.disconnect();
  }
}
