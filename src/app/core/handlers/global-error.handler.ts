import { ErrorHandler, Injectable, Injector, NgZone, isDevMode } from '@angular/core';
import { Router, NavigationError } from '@angular/router';

/**
 * Error context for logging and reporting.
 */
export interface ErrorContext {
  /** Error message */
  message: string;
  /** Error stack trace */
  stack?: string;
  /** Current route path */
  route?: string;
  /** Application version */
  version?: string;
  /** ISO timestamp */
  timestamp: string;
  /** Error type/category */
  category: 'runtime' | 'navigation' | 'http' | 'unknown';
  /** Additional context data */
  context?: Record<string, unknown>;
}

/**
 * Global error handler that captures and reports all unhandled errors.
 * 
 * Features:
 * - Captures runtime errors from components and services
 * - Logs errors with contextual information (route, timestamp)
 * - Distinguishes between error categories
 * - Non-blocking error handling (doesn't crash the app)
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private version = '1.0.0';

  constructor(
    private injector: Injector,
    private zone: NgZone
  ) {}

  handleError(error: Error | unknown): void {
    // Run outside Angular to prevent change detection loops
    this.zone.runOutsideAngular(() => {
      const errorContext = this.buildErrorContext(error);
      this.logError(errorContext);
      
      // Re-throw in development for debugging
      if (this.isDevelopment()) {
        console.error('[GlobalErrorHandler] Original error:', error);
      }
    });
  }

  /**
   * Handle navigation errors specifically.
   */
  handleNavigationError(event: NavigationError): void {
    const errorContext: ErrorContext = {
      message: event.error?.message || 'Navigation failed',
      stack: event.error?.stack,
      route: event.url,
      version: this.version,
      timestamp: new Date().toISOString(),
      category: 'navigation',
      context: {
        targetUrl: event.url,
        navigationId: event.id
      }
    };
    
    this.logError(errorContext);
  }

  private buildErrorContext(error: Error | unknown): ErrorContext {
    const router = this.injector.get(Router, null);
    const currentRoute = router?.url || 'unknown';

    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
        route: currentRoute,
        version: this.version,
        timestamp: new Date().toISOString(),
        category: this.categorizeError(error)
      };
    }

    // Handle non-Error objects
    return {
      message: String(error),
      route: currentRoute,
      version: this.version,
      timestamp: new Date().toISOString(),
      category: 'unknown'
    };
  }

  private categorizeError(error: Error): ErrorContext['category'] {
    const message = error.message.toLowerCase();
    
    if (message.includes('navigation') || message.includes('route')) {
      return 'navigation';
    }
    
    if (message.includes('http') || message.includes('network') || message.includes('fetch')) {
      return 'http';
    }
    
    return 'runtime';
  }

  private logError(context: ErrorContext): void {
    // Format for console logging (production would send to logging service)
    const logMessage = `[${context.category.toUpperCase()}] ${context.message}`;
    
    console.error(logMessage, {
      route: context.route,
      timestamp: context.timestamp,
      version: context.version,
      ...(context.stack && { stack: context.stack }),
      ...(context.context && { context: context.context })
    });
  }

  private isDevelopment(): boolean {
    // Use Angular's isDevMode for proper environment detection
    return isDevMode();
  }
}
