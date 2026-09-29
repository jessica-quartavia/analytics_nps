# Analytics NPS · Quartavia

Camada analítica de NPS com **pipeline file-based** e **dashboard estático** (six views). A fonte operacional **BASE QV é somente leitura (SELECT)**; nenhum dado analítico é persistido de volta no Supabase.

## Objetivo

Consolidar NPS, movimento entre ciclos, visão por Engenheiro Patrimonial (EP), Voz do Cliente (VoC), CSAT, drivers associados e plano de ação priorizado — com diagnóstico executivo e QA de consistência — para fechamento cíclico recorrente.

## Arquitetura

```
BASE QV (Supabase, read-only SELECT)
        ↓ npm run refresh:nps
data/raw/<snapshot>/          export pontual + manifest
        ↓ lib/pipeline/build-analytics.mjs
data/processed/*              artefatos analíticos
data/outputs/*                fila operacional (action_queue)
data/quality/*                refresh_runs, QA, calibração
data/snapshots/latest.json    ponteiro do último refresh OK
data/operational/*            action_tracking (fora do refresh)
        ↓ fetch estático
dashboard/                    UI (#/executivo … #/plano-de-acao)
```

- **Browser:** não usa Supabase; lê JSON via HTTP.
- **Refresh:** usa `BASE_QV_SUPABASE_SERVICE_ROLE_KEY` apenas no servidor local/CI para SELECT.
- **Tracking de ações:** gravação só via `npm run dev` + `POST /api/operational/action_tracking` (ver `docs/ACTION_TRACKING.md`).

## Fontes

Detalhes em `docs/FONTES_DADOS.md`. Resumo: `nps_cycles`, `nps_responses`, `nps_sends`, `clients`, jornadas, transferências EP, `csat_responses`, catálogo EP.

## Estrutura `data/`

| Pasta | Conteúdo |
|--------|-----------|
| `data/raw/` | Snapshots por execução (`YYYY-MM-DDTHH-mm-ss/`) + `manifest.json` |
| `data/processed/` | `cycles`, `responses`, `cycle_summary`, `paired_cycles`, VoC, CSAT, drivers, fila enriquecida, diagnóstico |
| `data/quality/` | `refresh_runs.json`, `data_quality.json`, QA final, calibração |
| `data/operational/` | `action_tracking.json` (não sobrescrito pelo refresh) |
| `data/outputs/` | `action_queue.json` |
| `data/snapshots/` | `latest.json` (somente após refresh **success**), `runs/<refresh_id>.json` |
| `data/config/` | `nps-cycles.json`, `methodology.json` |

## Dashboard

| Rota | Página |
|------|--------|
| `#/executivo` | KPIs, diagnóstico executivo |
| `#/movimento` | Pareamento, migração |
| `#/eps` | Engenheiros patrimoniais |
| `#/voz-do-cliente` | VoC |
| `#/drivers` | Drivers |
| `#/plano-de-acao` | Fila + tracking |

Metodologia: link **Metodologia** na sidebar (drawer).

## Setup

```bash
cp .env.example .env   # preencher service_role BASE QV (refresh only)
npm install
npm test
```

## Comandos principais

| Comando | Uso |
|---------|-----|
| `npm run refresh:nps` | Pipeline completo BASE QV → processed |
| `npm run qa:final` | QA metodológico + cross-page consistency |
| `npm run healthcheck` | Pronto para publicar? (exit 0/1) |
| `npm run status` | Resumo rápido no terminal |
| `npm run validate` | healthcheck + test + smoke |
| `npm test` | Testes unitários/integração |
| `npm run smoke:dashboard` | Smoke responsivo (sobe servidor temporário) |
| `npm run dev` | Servidor local + API de tracking |

## Fluxo de refresh

1. Confirma read-only guard BASE QV.
2. Export raw snapshot + manifest (com versão de metodologia).
3. Calcula ciclos analíticos, dedupe, elegíveis, pareamento, EP, VoC, CSAT, drivers, fila, diagnóstico.
4. Registra `data/quality/refresh_runs.json` e entradas de qualidade.
5. **Se e somente se status = success:** atualiza `data/processed/*`, `data/outputs/*`, `snapshots/latest.json` e `snapshots/runs/<id>.json`.
6. Falha: processed/latest **não** são substituídos; erro fica em `refresh_runs`.

## Fluxo de QA

```bash
npm run qa:final
```

Gera/atualiza artefatos em `data/quality/` (calibração da fila, consistência entre páginas, amostra VoC, QA metodológico). Blocker de publicação se `cross_page_consistency.json` → `fail`.

## Fluxo de deploy

Publicar **somente**:

- `dashboard/**`
- `data/processed/**` (e `data/outputs/**` necessários à UI)
- `data/quality/**` usado pelo dashboard (se aplicável)
- `data/snapshots/latest.json`
- `data/operational/action_tracking.json` (read-only em estático)
- `data/config/methodology.json` (opcional, para transparência)

**Não publicar:** `.env`, chaves, `data/raw` sensível em excesso, scripts, imports temporários.

Fechamento mensal: `docs/ROTINA_MENSAL_NPS.md` e `docs/CHECKLIST_FECHAMENTO_CICLO.md`.

## Documentação

- `docs/ROTINA_MENSAL_NPS.md` — rotina de ciclo
- `docs/CHECKLIST_FECHAMENTO_CICLO.md`
- `docs/LIMITACOES_METODOLOGICAS.md`
- `docs/FONTES_DADOS.md`
- `docs/DICIONARIO_ARTEFATOS.md`
- `docs/DICIONARIO_DADOS.md`
- `docs/ACTION_TRACKING.md`
- `docs/TROUBLESHOOTING.md`
- `CHANGELOG.md`

Versões de metodologia: `data/config/methodology.json` (propagadas em `latest.json`, manifest raw e `executive_diagnosis.json`).

## Performance (referência)

Tempos do último ciclo ficam em `data/quality/refresh_runs.json` (refresh) e logs do terminal para `qa:final`, `npm test` e `smoke:dashboard`. Não há SLA automatizado — registrar manualmente no fechamento se necessário.
