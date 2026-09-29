# Refresh NPS (file-based)

```bash
npm run refresh:nps
```

## Pré-condições

1. `.env` com `BASE_QV_SUPABASE_*` (somente leitura)
2. Código confirma `confirmBaseQvReadOnly()` — sem `.insert/.update/.delete/.upsert` no cliente BASE QV
3. Nenhuma escrita em Supabase em nenhuma etapa

## Fluxo (`lib/pipeline/build-analytics.mjs`)

Ciclos analíticos vêm de `data/config/nps-cycles.json` + `lib/analytics/analytical-cycles.mjs` (não de `public.nps_cycles` como definição final).

1. Confirmar BASE QV read-only
2. Carregar config analítica; SELECT fontes (cycles, responses, sends, clients, jornada, EP)
3. Salvar `data/raw/<refresh-id>/` + `manifest.json`
4. Resolver **analytical_cycle_code**, dedupe `client_id + ciclo`, EP point-in-time
5. Excluir não mapeados de `processed/responses.json` → log `analytical_cycle_unresolved`
6. Histórico por `sequence` dos ciclos analíticos; base pareada; matriz 3×3
7. `cycle_summary.json` (NPS, IC95 bootstrap, distribuição 0–10), `eligible_clients`, `action_queue` (Set/2026)
8. Invariantes + baseline Jun–Jul; escrever `processed/`, `outputs/`, `quality/refresh_runs.json`

Requer **service role** read-only no `.env` (chave anon pode falhar em `clients` por RLS).

Idempotente: reexecutar sobrescreve arquivos `processed/` e `outputs/` atuais e append em logs de quality/runs.

## Migrations Supabase

**Não aplicar.** Arquivos em `supabase/migrations/` estão deprecated.
