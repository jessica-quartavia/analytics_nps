# Analytics NPS — Plano de Ação Gemini (n8n)

Workflow sugerido: **Analytics NPS — Plano de Ação Gemini** (manter **unpublished** até QA).

## Fluxo

1. **Trigger** — Schedule (diário) ou manual
2. **Postgres** — `SELECT source_id FROM analytics_nps.action_queue_pending_v1 LIMIT :batch`  
   _(ou HTTP interno que lista `action_queue_enriched` sem `ai_classifier_source`)_
3. **HTTP Request** — `POST https://analyticsnps.vercel.app/api/action-classify`  
   - Header: `Authorization: Bearer {{ANALYTICS_NPS_VOC_CLASSIFY_TOKEN}}`  
   - Body: campos do item (`source_id`, `comment`, `priority`, scores, `topics`, …)
4. **IF** — `needs_human_review === true` → fila de revisão (Slack / sheet)
5. **Postgres (Business Data `rckpuebaiswrxzmywllv`)** — upsert em `analytics_nps.action_cases`, `action_classifications`, histórico em `action_plan_history` (API `/api/action-classify` + script `enrich-action-operational.mjs`)
6. **Materialize** — `node scripts/enrich-action-operational.mjs` atualiza `action_queue_enriched.json` + snapshot `data/operational/action_plans.json`

**Status:** workflow permanece **unpublished** até concluir QA dos 25 casos Gemini.

## Variáveis Vercel

- `GEMINI_API_KEY`
- `ACTION_USE_GEMINI=1` ou `VOC_USE_GEMINI=1`
- `ACTION_AI_MODEL=gemini-3.6-flash` (opcional)
- `ANALYTICS_NPS_VOC_CLASSIFY_TOKEN`

## QA

- Batch 5 → validação manual
- Depois 25
- Só então lote completo
