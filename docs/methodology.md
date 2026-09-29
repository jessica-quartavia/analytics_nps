# Metodologia NPS

## Política

BASE QV is read-only.  
The analytics-nps project does not persist analytics data in Supabase.  
All analytical persistence is file-based.

## Classificação

- 0–6 Detrator
- 7–8 Neutro
- 9–10 Promotor

## NPS

Após resolução de ciclo, deduplicação e validação:

`NPS = ((promoters - detractors) / total_valid_responses) * 100`

Funções: `classifyNpsScore`, `calculateNps`, `calculateNpsSummary` em `lib/analytics/nps.mjs`.

## Resolução de ciclo

1. `nps_sends` coerente
2. Janela `starts_at` / `ends_at`
3. Ambiguidade → warning + ciclo mais recente
4. Sem ciclo conhecido → **`cycle_resolution_status: unresolved`** (não descartar; ex. pré-T2)

## Deduplicação

`client_id + cycle_id` (unresolved usa bucket `__unresolved__`). Mantém maior `submitted_at`. Log em `data/quality/data_quality.json`.

## EP point-in-time

`resolveEpAtDate` — logs de transferência, JSON histórico, proxy atual documentado.

## Views no banco

Não utilizar `CREATE VIEW` até autorização explícita.
