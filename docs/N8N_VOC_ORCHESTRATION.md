# VoC — orquestração n8n (arquitetura final)

## Responsabilidades

| Camada | Papel |
|--------|--------|
| **BASE QV** (`lacinxsvjdwalkchxyeo`) | SELECT only — `nps_responses`, `nps_cycles`, `clients`, … |
| **n8n** | Cron, runs, pendências, cache, upserts, retries, review queue |
| **Business Data** (`rckpuebaiswrxzmywllv`) | `analytics_nps.*` persistência |
| **Vercel** | `POST /api/voc-classify`, `POST /api/voc-prepare`, health — **sem banco** |
| **Gemini** | Chave só no Vercel (`GEMINI_API_KEY`) |

## Credenciais n8n (já cadastradas)

- **Business Data:** `Supabase account - Business Data` (`ljAgIQ3ShDU6l2zj`) ou `Postgres - Business Data` (`4PpLgshHFesCFajW`)
- **BASE QV:** Supabase/Postgres read-only do projeto lacinx (ex.: `Postgres - Lighthouse (read-only)` ou Supabase PROD — confirmar project ref)
- **Classifier HTTP:** Header Auth com `Authorization: Bearer <ANALYTICS_NPS_VOC_CLASSIFY_TOKEN>` (não é Gemini key)

## Endpoints Vercel

| Método | URL | Auth |
|--------|-----|------|
| GET | `/api/voc-classify/health` | não |
| POST | `/api/voc-classify` | Bearer classifier token |
| POST | `/api/voc-prepare` | Bearer classifier token |

`/api/voc-sync` — **legado/admin**, workflow n8n **não** deve usar.

## Workflow principal

**ID:** `ENqJyEuulA0vzoI6` — *Analytics NPS — Classificação VoC Gemini*  
**Status:** unpublished até golden five + idempotência.

### Fluxo (nodes sugeridos)

1. **Schedule Trigger** — 30 min (desligado até go-live)
2. **Postgres (Business Data)** — `INSERT analytics_nps.voc_classification_runs` (`status=running`, …) → `run_id`
3. **Postgres (BASE QV)** — SELECT `nps_responses` WHERE `submitted_at >= now() - interval '72 hours'` AND `tipo_de_forms ILIKE 'NPS%'`
4. **Loop** — por resposta (limit configurável via workflow static data)
5. **HTTP POST** `/api/voc-prepare` — body: `source_row`, `client`, `source_cycles` (buscar ciclos 1× no início)
6. **Split units** — por item em `units[]`
7. **Postgres** — UPSERT `voc_responses`
8. **Postgres** — SELECT cache `voc_ai_cache` WHERE `input_hash`
9. **IF cache miss** → **HTTP POST** `/api/voc-classify` (retry 429/503/504: 10s, 30s, 60s)
10. **Postgres** — UPSERT `voc_ai_cache`
11. **Postgres** — UPSERT `voc_classifications` ON CONFLICT `(input_hash, topic, classifier_version)`
12. **IF needs_human_review** → INSERT `voc_review_queue` (dedupe pending)
13. **Aggregate counters** → UPDATE run `finished_at`, `status`, contadores
14. **Error Trigger** (workflow separado) — UPDATE run `failed`, `errors` sanitizado

### Constantes

- `classifier_version`: `gemini_v1`
- `prompt_version`: `voc-gemini-prompt-v3` (via resposta `/api/voc-classify`, não hardcode no n8n)
- `requested_model`: `gemini-3.6-flash`

### Review queue

Mesmas regras do código (`needsHumanReview`):

- confidence &lt; 0.65
- Promotor + Negativa com confidence &lt; 0.80
- Detrator + Positiva com confidence &lt; 0.80

## Env Vercel (classifier only)

```env
GEMINI_API_KEY=...
VOC_AI_PROVIDER=gemini
VOC_AI_MODEL=gemini-3.6-flash
VOC_USE_GEMINI=1
VOC_AI_TIMEOUT_MS=240000
ANALYTICS_NPS_VOC_CLASSIFY_TOKEN=...
```

**Remover da Vercel** (automação): `ANALYTICS_NPS_DATABASE_URL`, `ANALYTICS_NPS_DB_MODE`, service role Business Data, `VOC_SOURCE_MODE`, BASE QV keys — salvo se `/api/voc-sync` admin for mantido.

## Go-live checklist

- [ ] GET `/api/voc-classify/health` → 200
- [ ] Manual limit=1 no n8n
- [ ] Golden five
- [ ] Limit=5
- [ ] Segunda execução idempotente
- [ ] Publicar workflow `ENqJyEuulA0vzoI6`
