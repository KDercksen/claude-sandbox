# Development Guide

## Setup

```bash
git clone <repo-url>
cd claude-sandbox
npm install
npm run build
```

`npm run build` compiles TypeScript (`src/`) to `dist/` via `tsc -b`. The `dist/` directory is the runtime artifact — always rebuild after source changes.

## Building the Docker image

```bash
./bin/run.js build
```

Builds from `docker/Dockerfile`. Installs Claude Code, an SSH server, tmux, and firewall tools into the container. The image tag defaults to `claude-sandbox:latest`; it is configurable via the config file. Rebuild the image whenever `docker/Dockerfile` or its supporting files change.

## Running tests

```bash
npm test                     # all tests (+ lint as posttest)
npx mocha test/lib/          # unit tests only — no Docker needed
npx mocha test/commands/     # CLI output tests — no Docker needed
npx mocha test/integration/  # integration tests — Docker required
```

Test layout:

- `test/lib/` — unit tests for pure functions: container naming, prompt building, SSH helpers. No Docker.
- `test/commands/` — tests for CLI command output.
- `test/integration/` — spins up real containers and verifies firewall rules. Requires Docker and the built image. Per-suite timeout is 180 s.

Framework: mocha with `--forbid-only`, chai for assertions, ts-node ESM loader (`loader=ts-node/esm`). The default mocha timeout is 60 s (overridden per-suite in integration tests).

## Linting

```bash
npm run lint
```

ESLint with `eslint-config-oclif` and `eslint-config-prettier`. Lint runs automatically after `npm test` via the `posttest` script. The ESLint config respects `.gitignore` for ignored paths.

## Adding a new command

1. Create `src/commands/<name>.ts`.
2. Export a default class extending `Command` from `@oclif/core`.
3. Define static properties as needed:

   ```typescript
   import {Args, Command, Flags} from '@oclif/core'

   export default class MyCommand extends Command {
     static description = 'What this command does'
     static flags = {
       port: Flags.integer({description: 'Port number', default: 2222}),
     }
     static args = {
       name: Args.string({description: 'Container name', required: true}),
     }

     async run(): Promise<void> {
       const {args, flags} = await this.parse(MyCommand)
       this.log(`Running with ${args.name} on port ${flags.port}`)
     }
   }
   ```

4. oclif auto-discovers commands by filename from `dist/commands/` — no registration needed.
5. Add tests in `test/commands/<name>.test.ts`.
6. For a minimal example, see `src/commands/stop.ts`.

Key conventions:
- `this.log()` for stdout output.
- `this.error()` to print an error and exit with a non-zero code.
- `Flags.string()`, `Flags.integer()`, `Flags.boolean()` for typed flags.
- `Args.string()` etc. for positional arguments.
- `oclif manifest` (run at `prepack` time) regenerates `oclif.manifest.json`.

## Project structure

```
src/commands/   one file per CLI command, auto-discovered by oclif
src/lib/        shared logic (Docker, SSH, config, prompt building)
docker/         Dockerfile and supporting files for the container image
test/           mirrors src/ layout: lib/, commands/, integration/
skills/         Claude Code plugin skill definitions
hooks/          Claude Code plugin hooks
```

All source is TypeScript targeting ES2022 with `module: Node16` and strict mode enabled.
