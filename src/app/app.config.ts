import { ApplicationConfig, provideBrowserGlobalErrorListeners, APP_INITIALIZER, inject } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MessageService } from 'primeng/api';
import { ConfirmationService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { BackendService } from './core/services/backend.service';
import { FileSystemBackendService } from './core/services/file-system-backend.service';
import { ThemeService } from './core/services/theme.service';

import { routes } from './app.routes';

// Factory function to initialize ThemeService
function initializeThemeService(): () => void {
  return () => {
    // ThemeService is instantiated when injected, which triggers the effect
    inject(ThemeService);
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation()),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.p-dark'
        }
      }
    }),
    MessageService,
    ConfirmationService,
    ThemeService,
    {
      provide: APP_INITIALIZER,
      useFactory: initializeThemeService,
      multi: true
    },
    // Backend abstraction: switch between FileSystemBackendService and RestBackendService here
    { provide: BackendService, useClass: FileSystemBackendService }
  ]
};
