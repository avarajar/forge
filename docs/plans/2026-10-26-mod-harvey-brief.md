# Brief: mod-harvey, primer módulo de terceros sobre el SDK v1

Fecha: 2026-10-26. Complementa `2026-09-09-plugin-ecosystem-brief.md`: es el caso real
con el que se diseña el SDK v1 y el "módulo de terceros publicado en npm" que pide ese brief.

## Qué es Harvey

[Harvey](https://github.com/ethanplusai/harvey) es un agente de ventas autónomo, open
source (Python 3.11+, FastAPI), de un tercero (ethanplusai). Busca negocios, lee sus
sitios web, escribe correos en frío personalizados, los envía, lee las respuestas y lleva
la conversación hacia una reunión. Corre en local, en un loop, y usa la suscripción de
Claude Code (o Codex) en lugar de una API key: cada llamada al modelo es un `claude`
aislado (`--safe-mode`, sin CLAUDE.md, hooks, skills ni MCP).

No es una herramienta de desarrollo. Por eso sirve como prueba: si el SDK aguanta un agente
de negocio con procesos largos, efectos externos y su propia API, aguanta módulos de dev.

### Cómo funciona

- **Heartbeat** (`harvey run`): cada 15 min despierta, revisa horario y cuota, decide de
  forma determinista (responder > enviar > escribir > prospectar > analizar), actúa,
  registra y duerme. Proceso largo con pidfile.
- **Pipeline de prospección:** discover (única etapa con costo; estima antes de gastar,
  tope `--max-spend`) → profile (gratis, 3 requests HTTP por negocio) → signals (criterios
  que el usuario confirma) → writer.
- **Outbox:** con `require_approval: true` nada sale sin aprobación humana. Aprobar un
  correo **envía correo real a un tercero**.
- **Estado:** SQLite en `data/harvey.db`; config en `harvey.yaml` + `harvey.local.yaml`
  (generado por `harvey train <url>`).

### Superficie que puede usar un módulo

CLI: `harvey status | discover [--estimate] | profile | signals | outbox | sending
pause/resume | run | usage | dashboard`.

Dashboard en `localhost:5555` con API JSON:

- GET: `/api/today`, `/api/outbox`, `/api/stats`, `/api/usage`, `/api/harvey/status`,
  `/api/harvey/logs`, `/api/live-status`, `/api/conversations`, `/api/signals`,
  `/api/runs`, `/api/companies`, `/api/prospects`, `/api/campaigns`, `/api/settings`,
  `/api/setup-status`, `/api/discover/providers`.
- POST: `/api/outbox/{id}/approve|edit|reject`, `/api/outbox/approve-all`,
  `/api/harvey/start|stop`, `/api/discover/estimate|run|stop`, `/api/profile/run`,
  `/api/cohort`, `/api/conversations/{id}/status`.
- Auth: `Authorization: Bearer <token>`, token en `data/dashboard-token` (archivo
  owner-only). Rechaza un `Host` que no sea localhost (anti DNS-rebinding).
- CSP `frame-ancestors 'none'`: **no se puede embeber en un iframe.**

## Estado local

- Checkout en `~/workspace/tools/harvey`, venv en `.venv` (`.venv/bin/harvey`).
- Entrenado con saludbot.co (ICP: consultorios dentales en Colombia). Discover con
  OpenStreetMap en Bogotá: 284 consultorios, solo 1 con sitio web; falta una fuente de pago
  (DataForSEO) para datos útiles. No hay buzón conectado; nunca se ha enviado nada.

## Estado de Forge que condiciona el diseño

- El server carga manifests desde `~/.forge/modules` (`packages/core/src/modules.ts`) y
  corre sus acciones de shell por `/api/actions`.
- La consola **no renderiza paneles de módulos** desde que se reescribió como lanzador de
  tareas de CW: no hay registro de paneles. El SDK v1 tiene que decir dónde viven los
  paneles en la consola actual (vista propia en la sidebar, como Skills o Prototypes).
- `defineRoute`, permisos y eventos no existen todavía.
- Todo pasa por `origin-guard.ts`; un proxy a Harvey no puede abrir Forge a otros orígenes.

## Qué tiene que resolver el SDK v1 con este caso

1. **Permisos acotados:** `network` limitado a `localhost:<puerto>`, `fs:read` limitado
   al token, `shell` para la CLI.
2. **`defineRoute` como proxy server-side:** lee el token y reenvía a la API sin
   exponerlo al navegador; error claro cuando Harvey no está corriendo.
3. **Procesos largos:** iniciar, detener y vigilar `harvey run` (reusar el kill por
   process group de 8956661).
4. **Acciones con efecto externo:** un nivel de confirmación explícito en el SDK (p. ej.
   `effect: "external"`) para que aprobar y enviar nunca sea un clic accidental.
5. **Settings del módulo:** ruta del checkout, puerto, provider (claude/codex).
6. **Eventos:** respuesta nueva o conversación devuelta al humano → notificación en Forge.
7. **Paneles de ejemplo:** Hoy, Outbox, Pipeline (discover con estimación de costo antes
   de correr).
8. **Distribución:** paquete npm externo, descubrimiento y `forge module install`.

## Reglas

- mod-harvey consume la API pública de Harvey; nunca lee su SQLite directamente.
- Lluvia de ideas y spec antes de código, como en el brief del ecosistema.
