import { Injectable, signal, computed, effect, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'raci-theme-mode';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly themeMode = signal<ThemeMode>('system');
  private readonly systemPrefersDark = signal<boolean>(false);
  
  readonly currentMode = computed(() => this.themeMode());
  readonly isDarkMode = computed(() => {
    const mode = this.themeMode();
    if (mode === 'system') {
      return this.systemPrefersDark();
    }
    return mode === 'dark';
  });

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    if (isPlatformBrowser(this.platformId)) {
      // Load saved preference
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
      if (saved && ['light', 'dark', 'system'].includes(saved)) {
        this.themeMode.set(saved);
      }

      // Detect system preference
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.systemPrefersDark.set(mediaQuery.matches);
      
      mediaQuery.addEventListener('change', (e) => {
        this.systemPrefersDark.set(e.matches);
      });

      // Apply theme on changes
      effect(() => {
        this.applyTheme(this.isDarkMode());
      });
    }
  }

  setThemeMode(mode: ThemeMode): void {
    this.themeMode.set(mode);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    }
  }

  toggleTheme(): void {
    const current = this.themeMode();
    if (current === 'light') {
      this.setThemeMode('dark');
    } else if (current === 'dark') {
      this.setThemeMode('light');
    } else {
      // System mode - toggle based on current effective mode
      this.setThemeMode(this.isDarkMode() ? 'light' : 'dark');
    }
  }

  private applyTheme(isDark: boolean): void {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark-mode');
      root.classList.remove('light-mode');
    } else {
      root.classList.add('light-mode');
      root.classList.remove('dark-mode');
    }
  }
}
