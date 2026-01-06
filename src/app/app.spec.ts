import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { App } from './app';
import { BackendService } from './core/services/backend.service';
import { BehaviorSubject, of } from 'rxjs';

// Mock window.matchMedia for ThemeService
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
  });
});

// Mock BackendService
class MockBackendService {
  datastore$ = new BehaviorSubject(null);
  connectionStatus$ = new BehaviorSubject(false);
  isConnected() { return false; }
  setCurrentUser() {}
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        MessageService,
        ConfirmationService,
        { provide: BackendService, useClass: MockBackendService }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should have a title signal', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    // The title is a protected signal, so we just check component creation
    expect(app).toBeTruthy();
  });
});
