import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { AppComponent } from './app.component';
import { BackendService } from './core/services/backend.service';
import { BehaviorSubject, of } from 'rxjs';

// Mock window.matchMedia for jsdom environment
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

describe('AppComponent', () => {
  let mockBackendService: Partial<BackendService>;

  beforeEach(async () => {
    mockBackendService = {
      connectionStatus$: new BehaviorSubject<boolean>(false),
      datastore$: of(null),
      setCurrentUser: () => {},
      getDatastore: () => null,
      isConnected: () => false
    };

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        MessageService,
        ConfirmationService,
        { provide: BackendService, useValue: mockBackendService }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h2')?.textContent).toContain('RACI Topic Finder');
  });
});
