# Repository Guidelines

## Project Structure & Module Organization
- `App.tsx` is the main UI root; `index.tsx` boots the app.
- `components/` holds React UI modules, grouped by feature.
- `lib/` contains clients and helpers (Supabase, Bilibili API, AI models).
- `api/` hosts Vercel serverless functions.
- `assets/` and `public/` store images/icons and static files.
- `supabase/` contains database migrations; `styles/`, `services/`, `doc/` add supporting code/docs.
- `dist/` and `dev-dist/` are build outputs (do not edit).

## Build, Test, and Development Commands
- `npm install` installs dependencies.
- `npm run dev` starts the Vite dev server.
- `npm run build` creates a production build in `dist/`.
- `npm run preview` serves the production build locally.

## Coding Style & Naming Conventions
- TypeScript + React with JSX; follow existing patterns in `App.tsx` and `components/`.
- Use 2-space indentation, single quotes, and semicolons (match current files).
- Component files use `PascalCase.tsx` (e.g., `VideoCard.tsx`); hooks use `useX`.
- Prefer path alias `@/` for root imports when it keeps paths short.

## Testing Guidelines
- No test framework or `test` script is configured yet.
- If you introduce tests, add a script in `package.json` and document the command here.
- Keep test names descriptive of behavior (e.g., `VideoCard renders title`).

## Commit & Pull Request Guidelines
- Commits follow a lightweight conventional style: `feat`, `fix`, `refactor`, etc., sometimes with a scope (example: `feat(insights): add history management`).
- Write messages in present tense and keep them specific.
- PRs should include a brief summary, testing notes, and screenshots/GIFs for UI changes.
- Note any env var changes and update `.env.example` when needed.

## Configuration & Secrets
- Copy `.env.example` to `.env.local` for local work.
- Required keys include `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `BILIBILI_COOKIE`; `GEMINI_API_KEY` is optional.
