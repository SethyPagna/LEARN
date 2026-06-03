# Root File Map

LEARN keeps most implementation, operations, and planning files inside grouped folders. The few files left in the repository root are there because common tools discover them automatically from the project root.

## Tool Entry Files

- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`: package manager entry points.
- `tsconfig.json`, `next-env.d.ts`: TypeScript and Next.js compiler entry points.
- `next.config.mjs`, `postcss.config.mjs`, `open-next.config.ts`: Next.js, PostCSS/Tailwind, and OpenNext build entry points.
- `components.json`: shadcn/ui component metadata.
- `vercel.json`: Vercel project deployment metadata.
- `.gitignore`, `.dockerignore`: repository and Docker build-context ignore rules.
- `README.md`: public project overview.

## Organized Folders

- `.github`: GitHub Actions and repository automation.
- `src/app`, `src/components`, `src/lib`, `src/tests`, `src/workers`: product source, tests, and Worker entry points grouped under the source tree.
- `ops/migrations`: Cloudflare D1 schema migrations.
- `ops`: deploy, cleanup, seed, Docker, Cloudflare, and environment template operations.
- `ops/run`: Windows-friendly command wrappers.
- `ops/docs`: architecture notes, roadmap plans, operations docs, and implementation plans grouped by topic.
- `public`: static assets; generated browser vendor assets are rebuilt locally and ignored.
- Generated local logs such as `ops/learn-dev-3001.out.log` are ignored, excluded from Docker builds, and removed by the workspace cleanup script.

## Conversion Policy

Project source and operations code should be TypeScript. JavaScript files are not accepted by `tsconfig.json`. The only tracked JavaScript-family exceptions are `next.config.mjs` and `postcss.config.mjs`, which remain ES modules for verified Next.js and Tailwind production-build compatibility. Generated browser vendor assets under `public/vendor` are rebuilt from installed packages and ignored.
