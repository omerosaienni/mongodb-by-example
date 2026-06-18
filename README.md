# Mongo playground

A local MongoDB learning harness. Native TypeScript driver, Mongo in Docker as a
single node replica set, Make for infra, npm for per-feature examples.

This is a stub. The full README arrives in a later deliverable.

## Quick start

```sh
npm install      # install dependencies
make help        # list infra targets
npm run typecheck
npm test
npm run lint
```

## Layout

- `src/` shared code
- `src/examples/` one runnable module per feature
- `scripts/` infra scripts driven by the Makefile
