import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { map } from 'rxjs/operators';
import { BackendService } from '../services/backend.service';

/**
 * Guard that restricts access to routes when no directory is connected.
 * Only allows access to settings and search (welcome screen) when disconnected.
 */
export const connectionGuard: CanActivateFn = () => {
  const backend = inject(BackendService);
  const router = inject(Router);

  return backend.connectionStatus$.pipe(
    map(isConnected => {
      if (!isConnected) {
        // Redirect to search (welcome screen) if not connected
        router.navigate(['/search']);
        return false;
      }
      return true;
    })
  );
};
