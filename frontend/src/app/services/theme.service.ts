import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private storageKey = 'theme';

  constructor() {
    const saved = localStorage.getItem(this.storageKey);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.apply(saved === 'dark' || (!saved && prefersDark) ? 'dark' : 'light');
  }

  get current(): 'light' | 'dark' {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  toggle() {
    this.apply(this.current === 'dark' ? 'light' : 'dark');
  }

  private apply(theme: 'light' | 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(this.storageKey, theme);
  }
}
