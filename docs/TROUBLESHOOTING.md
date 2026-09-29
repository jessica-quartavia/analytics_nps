# Runbook de incidentes

## `npm run dev` falha

- Confirmar Node LTS e `npm install`.
- Ver `scripts/dev-server.mjs` — porta padrão 5173.
- **Porta ocupada:** `PORT=5180 npm run dev` (Windows: `$env:PORT=5180`).

## `package.json` não encontrado

- Executar comandos dentro de `analytics-nps/` (raiz do projeto npm).

## Refresh falha (`npm run refresh:nps`)

- Verificar `.env`: `BASE_QV_SUPABASE_URL`, `BASE_QV_SUPABASE_SERVICE_ROLE_KEY`.
- **service_role ausente:** SELECT em `clients` falha por RLS.
- Ler última linha em `data/quality/refresh_runs.json` (`status`, `errors`).
- Baseline Jun–Jul: falha `jun_jul_reconciliation_failure` — não force publish; corrigir dados/config.
- Após falha: `data/processed` e `latest.json` **permanecem** na última versão success.

## Snapshot / ingest

- Usar snapshot raw existente: `ANALYTICS_INGEST_SNAPSHOT=2026-09-28T20-55-21 npm run refresh:nps` (exemplo).
- Manifest em `data/raw/<id>/manifest.json`.

## JSON inválido

- `npm run healthcheck` aponta arquivo.
- Restaurar de backup git ou reexecutar refresh success.

## Dashboard sem dados

- Servir raiz do repo (dev server mapeia `/data`).
- Confirmar `data/processed/*.json` existem.
- Browser: erros 404 no Network tab.

## Ciclo não aparece no filtro

- Conferir `data/processed/cycles.json` e `nps-cycles.json`.
- Refresh success necessário após mudança de config.

## Action tracking não salva

- Deploy estático: **esperado** — só leitura.
- Local: usar `npm run dev`, não abrir HTML via `file://`.
- Ver permissões de escrita em `data/operational/`.

## Smoke Puppeteer falha

- Instalar Chromium via `npx puppeteer browsers install chrome`.
- Porta `SMOKE_PORT` (default 5178) livre.
- Firewall bloqueando localhost.

## Healthcheck exit 1

| Código | Ação |
|--------|------|
| `refresh_not_success` | Reexecutar refresh até success |
| `cross_page_fail` | `npm run qa:final`, corrigir divergências |
| `missing_file` | Refresh incompleto ou deploy parcial |
| `invalid_json` | Reparar arquivo ou regenerar |

Warnings (`partial_cycle`, `voc_unreviewed`, …) **não** bloqueiam deploy por padrão.

## Testes falhando

- `npm test` — corrigir regressão antes de publish.
- Não usar `--no-verify` em hooks sem necessidade.
