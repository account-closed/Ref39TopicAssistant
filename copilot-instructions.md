# copilot-instructions.md

## Project Overview

This project is a browser-only Angular 21 + PrimeNG 21 application opened directly from a Windows UNC path:

\server\share\app\index.html

There is no backend.
All data is stored as JSON files on the same SMB share and accessed via the File System Access API (Edge/Chrome).

Primary purpose:
Enable fast identification of the responsible person (RACI) for a topic, plus a secondary AI-based semantic search for pasted incoming emails.

All UI text is German.

---

## Hard Constraints (Must Not Be Violated)

* Browser-only (no server, no Node backend, no helper service)
* Target browsers: Edge / Chrome (Chromium)
* App is opened from UNC / file origin
* All users can edit
* Shared JSON datastore on SMB
* Writes coordinated via lock.json with TTL
* Hash-based routing only
* No Service Worker dependency
* Prefer simple, explicit solutions over complex abstractions

---

## Clear, Professional, Fast UI (Mandatory)

* Prioritize speed of execution for frequent tasks (search and assignment).
* Keep the UI uncluttered:

  * minimal text density
  * consistent spacing
  * clear typography
  * avoid unnecessary dialogs and multi-step flows
* Optimize for keyboard workflows where it matters:

  * search field autofocus
  * arrow navigation in result lists/tables
  * Enter for primary action
  * accessible shortcuts in Schnellzuordnung
* Always provide immediate feedback:

  * loading indicators for file read/index build
  * toast for save/refresh outcomes
  * visible lock/read-only state
* Avoid surprising behavior:

  * do not auto-save by default for batch workflows
  * do not change user’s search query or selection on refresh

---

## Theme, Styling, Icons (Mandatory)

* Use SCSS (not plain CSS) for global and component styling.
* Implement a consistent, minimal design system:

  * define a small set of semantic color tokens (primary, secondary, success, warning, danger, surface, text)
  * avoid ad-hoc colors scattered across components
* Implement Dark Mode and Light Mode:

  * default follows system preference if available
  * allow user toggle in UI (persist choice in localStorage)
  * ensure sufficient contrast and accessibility in both modes
* Use a consistent icon set:

  * PrimeIcons preferred (since PrimeNG is used)
  * use icons consistently for actions (create/edit/delete/save/search/refresh/lock)
* Ensure visual consistency:

  * consistent spacing scale, typography scale, and component sizing
  * consistent button styles (primary vs secondary vs danger)
  * consistent table density for fast scanning

---

## Angular 21 Signals (Mandatory)

* Use Angular 21 signals as the default state mechanism for:

  * UI state (selected member, current search query, selected rows)
  * derived view state (filtered/sorted lists, status bar fields)
  * lock status and TTL countdown (exposed as signals)
* Use computed signals for derived data (e.g., resolved member names, badges, status text).
* Use effects for controlled side effects (e.g., rebuild index on datastore revision changes).
* Use RxJS only where it provides clear value:

  * polling, debounced input streams, async file IO coordination
  * integrate RxJS with signals cleanly (avoid duplicate sources of truth)

---

## Shared Data Files

The app works with three files in a connected SMB folder:

* datastore.json – source of truth (topics and team members)
* lock.json – edit lock with TTL
* refresh.json – refresh signal for other clients

Never assume filesystem access.
Always require explicit user action to connect the folder using the File System Access API.

---

## Persistence Rules

* All writes must go through a single commit pipeline.
* Before writing:

  * read lock.json
  * acquire lock if stale or missing
  * wait 1 second
  * re-read lock.json and verify ownership
* During commit:

  * re-read datastore.json
  * apply change
  * increment revisionId
  * update generatedAt
  * write full file (no partial writes)
* After commit:

  * verify written datastore.json
  * update refresh.json
  * release lock by writing a stale lock
* Never write without holding the lock.
* Always re-read before writing to avoid stale state.

---

## Search Strategy

There are two distinct search mechanisms:

### Deterministic Search (Primary)

* Runs on every keystroke
* Uses a JavaScript fuzzy search engine (e.g. FlexSearch)
* Searches header, tags, keywords, description (notes optional)
* Must be instant and predictable
* No AI involved

### AI Semantic Search (Secondary)

* Separate screen
* User pastes full incoming email text
* Runs only on demand
* Uses Transformers.js embeddings
* Purpose: find the most relevant topic and show the responsible person (R1)
* AI search must never replace deterministic search

---

## AI Usage Rules

* AI is used only for semantic similarity.
* No chat interface.
* No external APIs.
* No cloud calls.
* Embeddings run locally in the browser.
* Topic embeddings may be stored in datastore.json.
* Long emails must be cleaned/truncated before embedding.
* AI is an assistive feature, not a core dependency.

---

## UI Guidelines (PrimeNG)

* Use PrimeNG tables with:

  * sorting
  * column filters
  * global filter
  * pagination
  * clear empty states (German)
  * responsive layout
* Use PrimeNG dialogs, forms, and toasts consistently.
* Provide clear German labels and validation messages.
* Always show a global status bar with:

  * app version and build time
  * app path (UNC if available)
  * data revision and timestamp
  * lock status and remaining TTL
  * write connectivity state
* Never hide critical system state from the user.

---

## Angular 21 Best Practices (Follow Strictly)

### Architecture and Separation of Concerns

* Prefer a clear layered structure:

  * UI components: presentation only
  * feature facades / view-model services: orchestration and state composition
  * core services: persistence, locking, refresh polling, indexing
  * pure utility functions: parsing, scoring, normalization
* Keep domain logic out of templates and out of component constructors.
* Components must not directly perform filesystem operations; use services.

### Standalone Components and Modern Angular

* Use standalone components exclusively.
* Prefer OnPush change detection for components that render lists/tables.
* Use signals and computed signals heavily for local state and derived state.
* Keep effects minimal and explicit; avoid hidden side effects.

### State Management (Keep It Simple and Explicit)

* Use a small number of central stores/services (signal-based):

  * DatastoreStore (read model + derived lookups)
  * SessionStore (selected “Ich bin”)
  * LockStore (lock status + countdown)
  * SearchIndexStore (built index + ready flag)
  * ThemeStore (dark/light mode + persistence)
* Expose read-only state to components; mutate state only through explicit methods.
* Avoid hidden shared mutable objects; prefer immutable updates for datastore in memory.

### RxJS Hygiene

* Avoid manual subscriptions in components unless necessary; use takeUntilDestroyed.
* Avoid nested subscriptions; use switchMap, combineLatest, withLatestFrom.
* Make polling cancellable and resilient to transient errors.

### Performance

* Precompute derived fields (normalized search blobs, display strings).
* Avoid re-indexing unnecessarily; rebuild only when revision changes.
* Use trackBy for all table/list ngFor renderings.
* Avoid heavy computation on every change detection cycle.
* Keep AI search behind explicit user action; never run it per keystroke.

### Error Handling and UX Robustness

* Wrap all file operations with:

  * clear German error messages
  * recovery actions (reconnect folder, retry, switch to read-only)
* Never crash on invalid JSON; keep last valid state and show an error banner.
* Handle lost permissions gracefully.

### Testing

* Unit test pure logic:

  * search scoring
  * normalization/tokenization
  * validity logic
  * lock TTL evaluation
  * theme persistence logic
* Keep tests deterministic (no reliance on actual SMB).

---

## Anti-Patterns to Avoid (Do Not Introduce)

* Do not use any.
* Do not put logic into templates (no complex expressions, no filtering/sorting in template).
* Do not perform filesystem reads/writes inside components.
* Do not use global singletons with hidden mutable state.
* Do not ignore unsubscribe; use Angular lifecycle-safe patterns.
* Do not use setInterval everywhere; centralize polling in a service.
* Do not rebuild full indexes on minor UI events; only on datastore change.
* Do not block the UI thread with long loops; chunk heavy work if needed.

---

## Folder Structure Convention

Use a feature-oriented structure:

* core/

  * services/
  * models/
* features/

  * search/
  * assignment/
  * topics/
  * members/
  * member-topics/
  * ai-search/
* shared/

  * components/
  * ui/
  * pipes/

Avoid business logic in components.
Place logic in services and view-model layers.

---

## When to Ask Questions

Ask only if:

* browser limitations block a required feature
* data volume assumptions change significantly
* performance constraints cannot be met

Do not ask about:

* backend APIs
* authentication
* cloud services

---

## Project Goal

Build a robust, predictable, maintainable local application that works reliably from an SMB share, safely supports multi-user editing, provides instant deterministic search, offers optional AI-assisted semantic lookup for pasted emails, and presents a professional UI with consistent styling, icons, and dark/light mode.
