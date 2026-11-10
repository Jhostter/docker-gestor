# Contributing / Contribuir

Thanks for your interest! / ¡Gracias por tu interés!

## Ideas that would help most

- **New languages:** the UI is available in English and Spanish. Adding another one is a single file: copy `src/app/locales/en.ts`, translate the values and register it in `src/app/i18n.ts` (TypeScript reports any missing key). A native-speaker review of the existing translations is welcome too.
- **Testing on macOS and Windows** with a real Docker (Docker Desktop, Colima…) and reporting back, or sending the missing autostart installers. See [docs/PLATFORMS.md](docs/PLATFORMS.md).
- Authentication for optional remote use.
- Tests.

## Getting started

```bash
git clone https://github.com/Jhostter/docker-gestor.git
cd docker-gestor
npm install
npm run dev          # http://localhost:4455  (stop the systemd service first if you installed it)
```

Before opening a pull request:

```bash
npm run typecheck
npm test
npm run build
npm run smoke
```

## Guidelines

- **Keep it light.** The project's goal is a very low resource footprint: avoid constant polling, heavy dependencies and anything that keeps work running while nobody is looking at the UI.
- **Keep it safe.** Every API route must go through `guard()` (Host/Origin check) and validate its input on the server. Don't weaken the localhost-only model.
- Prefer small, focused pull requests with a clear description of *what* and *why*.
- Match the existing style (TypeScript strict, Tailwind with the semantic color tokens in `globals.css`).
- Test against a real Docker daemon and mention what you tried. Please don't test destructive actions on containers or volumes you care about.

## Reporting bugs

Open an issue with your OS, Docker and Node versions, and the output of `journalctl --user -u docker-gestor -n 50` if you run it as a service. For security problems, **don't** open a public issue — see [SECURITY.md](SECURITY.md).

---

**ES:** Las contribuciones son bienvenidas. Mantén el consumo de recursos bajo, valida todo en el servidor, ejecuta `npm run typecheck` y `npm run build` antes de abrir un PR, y para problemas de seguridad sigue [SECURITY.md](SECURITY.md).
