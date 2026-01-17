# Contributing to RACI Topic Finder

Thank you for your interest in contributing to RACI Topic Finder! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 20.x or later
- npm 10.x or later
- A modern browser with File System Access API support (Chrome, Edge)

### Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm start
   ```
4. Open `http://localhost:4200` in your browser

## Code Standards

### TypeScript

- **Strict mode** is enabled - no implicit `any` types
- Use explicit return types for public methods
- Prefer `readonly` for immutable properties
- Use interfaces for data structures, types for unions/aliases

### Angular

- Use **standalone components** (no NgModules)
- Follow feature-based folder structure
- Use signals for reactive state where appropriate
- Implement `OnDestroy` to clean up subscriptions

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | `feature-name.component.ts` | `search.component.ts` |
| Services | `feature-name.service.ts` | `backend.service.ts` |
| Models | `entity.model.ts` | `topic.model.ts` |
| Observables | Suffix with `$` | `datastore$` |
| Signals | camelCase | `indexVersion` |

### File Organization

```
src/app/
├── core/           # Singleton services, models, handlers
│   ├── handlers/   # Error handlers, interceptors
│   ├── models/     # Data models and interfaces
│   └── services/   # Core application services
├── features/       # Feature modules (one per route)
│   └── <feature>/  # Component, service, styles
└── shared/         # Reusable components, utilities
    ├── components/ # Shared UI components
    └── utils/      # Helper functions
```

## Linting and Formatting

### Run Linter
```bash
npm run lint
```

### Fix Linting Issues
```bash
npm run lint:fix
```

### Code Style
- Prettier is configured for consistent formatting
- Single quotes for strings
- 100 character line width
- Angular HTML parser for templates

## Testing

### Run Tests
```bash
npm test
```

### Test Guidelines
- Write tests for services and utilities
- Use Vitest with Angular testing utilities
- Mock external dependencies (File System API, etc.)
- Test edge cases and error handling

## Building

### Development Build
```bash
npm run build
```

### Production Build
```bash
npm run build:prod
```

### Build Output
Production builds are output to `server/share/app/`

## Pull Request Process

1. **Branch naming**: `feature/description` or `fix/description`
2. **Commit messages**: Use conventional commits format
   - `feat: add search highlighting`
   - `fix: resolve lock timeout issue`
   - `docs: update README`
3. **PR description**: Include what changed and why
4. **Tests**: Ensure all tests pass
5. **Lint**: Fix all linting errors
6. **Review**: Wait for code review approval

## Architecture Guidelines

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

### Key Principles

- **Backend abstraction**: All storage operations go through `BackendService`
- **No cross-feature imports**: Features can only import from `core/` or `shared/`
- **Single responsibility**: One service per domain concept
- **Observable patterns**: Use RxJS for async state management

## Reporting Issues

When reporting issues, please include:
- Browser version
- Steps to reproduce
- Expected vs actual behavior
- Console errors (if any)
- Screenshots (for UI issues)

## Questions?

If you have questions about contributing, please open a discussion or contact the maintainers.
