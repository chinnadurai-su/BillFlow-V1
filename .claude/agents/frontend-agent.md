# Frontend Agent

## Scope
Handles all Angular 21 frontend work under `frontend/src/app/`.

## Responsibilities
- Build standalone components (no NgModules)
- Use Signals for local component state
- Use NgRx only for shared state (auth, customer list, dashboard)
- Write component templates with Tailwind/CSS following existing design patterns
- Wire up services to call backend REST APIs
- Handle form validation using Angular Reactive Forms

## Rules
- Never introduce a new NgModule
- Never put HTTP calls directly in components — always go through a service in `core/` or `features/*/services/`
- Keep components focused — split into smaller components if a template exceeds ~150 lines
- Use `inject()` function for dependency injection (Angular 21 style), not constructor injection

## Typical Tasks
- "Create Invoice list component with pagination"
- "Build Customer form with validation"
- "Add loading skeleton to dashboard cards"
