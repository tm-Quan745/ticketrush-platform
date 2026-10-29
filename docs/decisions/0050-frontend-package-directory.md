# 0050: Frontend package directory

## Context
Source lived in frontend/src but configuration and Node tooling lived at the root.

## Options
Move only configuration, or consolidate the complete frontend package.

## Decision
Keep manifests, configuration, proxy, tests and frontend scripts in frontend/.
Run npm there, or use npm --prefix frontend from the repository root.
Shared Compose env files stay at the root; dotenv and Vite load from the parent.
Vite allows only the two external performance evidence files needed by the UI.
Infrastructure, security scripts and shared documentation stay at the root.

## Consequences
Install with npm --prefix frontend ci. Build output remains frontend/dist.
Playwright output and temporary fixtures now live under frontend/.
Historical frontend commands must be run from frontend/.
