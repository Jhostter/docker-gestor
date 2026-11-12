# Security Policy

## Threat model

Docker Kong is a **local, single-user** tool. Access to Docker is equivalent to root on the host, so the app binds to `127.0.0.1`, validates `Host`/`Origin` on every request (including the terminal WebSocket) and has **no authentication**. Exposing it to a network or the internet without an authentication layer is unsupported and unsafe.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub: **Security → Report a vulnerability** on this repository (private security advisories).

Include a description, steps to reproduce, and the impact you foresee. You can expect an initial response within a few days.

Issues in scope include: bypassing the Host/Origin protection, command or argument injection, path traversal, and anything that lets a remote web page or another network host control Docker through the app.

---

**ES:** No abras un issue público. Usa *Security → Report a vulnerability* en GitHub para avisar en privado.
