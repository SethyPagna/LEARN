# Root File Map

LEARN keeps most implementation, operations, and planning files inside grouped folders. The few files left in the repository root are there because common tools discover them automatically from the project root.

## Tool Entry Files

- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`: package manager entry points.
- `tsconfig.json`, `next-env.d.ts`: TypeScript and Next.js compiler entry points.
- `next.config.mjs`, `postcss.config.ts`, `open-next.config.ts`: Next.js, PostCSS/Tailwind, and OpenNext build entry points.
- `components.json`: shadcn/ui component metadata.
- `vercel.json`: Vercel project deployment metadata.
- `.gitignore`, `.dockerignore`: repository and Docker build-context ignore rules.
- `README.md`: public project overview.

## Organized Folders

- `app`, `components`, `lib`, `styles`, `types`: product source code.
- `workers`: Cloudflare Worker entry points and runtime declarations.
- `migrations`: Cloudflare D1 schema migrations.
- `ops`: deploy, cleanup, seed, Docker, Cloudflare, and environment template operations.
- `run`: Windows-friendly command wrappers.
- `docs`: product, architecture, roadmap, and implementation plans.
- `tests`: fast unit and integration tests.
- `public`: static assets and third-party browser bundles.
- `.agents`: local agent metadata and skills lockfiles.

## Conversion Policy

Project source and operations code should be TypeScript. JavaScript files are not accepted by `tsconfig.json`. Exceptions need a tool or vendor reason, such as `next.config.mjs` for verified Next.js compatibility and minified third-party bundles under `public/vendor`.
