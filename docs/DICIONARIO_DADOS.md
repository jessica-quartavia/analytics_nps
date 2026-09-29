# Dicionário de dados (campos analíticos)

Foco em campos de negócio — omitidos detalhes triviais de UI.

## responses (`data/processed/responses.json`)

| Campo | Descrição |
|-------|-----------|
| `client_id` | UUID cliente BASE QV |
| `analytical_cycle_code` | Ciclo analítico (config) |
| `nps_score` | 0–10 |
| `nps_class` | promotor / neutro / detrator |
| `comment` | Verbatim NPS |
| `ep_at_response` | EP imputado na data |
| `paired_with_previous` | boolean — entrou na base pareada |
| `is_duplicate` | removido do cálculo se true (não exportado na lista final válida) |

## cycles (`cycles.json` + config)

| Campo | Descrição |
|-------|-----------|
| `cycle_code` | Identificador estável |
| `cycle_name` | Rótulo UI (ex. Set/2026) |
| `sequence` | Ordem temporal analítica |
| `status` | partial / complete (regras históricas) |

## paired (`paired_cycles.json`)

| Campo | Descrição |
|-------|-----------|
| `current_cycle` / `previous_cycle` | Par configurado |
| `paired_clients` | N clientes com resposta em ambos |
| `delta_nps` | Variação NPS pareado |
| `migration_*` | Resumo movimento (ver migration_matrix) |

## EP (`ep_summary.json`)

| Campo | Descrição |
|-------|-----------|
| `ep_id` / `ep_name` | Engenheiro |
| `valid_responses` | N |
| `nps` | NPS carteira no ciclo |
| `current_proxy_share` | Fração via proxy atual |

## VoC (`response_topics`, `topic_summary`)

| Campo | Descrição |
|-------|-----------|
| `topic_id` / `topic_label` | Tema rules_v1 |
| `valence` | positivo / negativo / neutro |
| `confidence` | 0–1 classificador |
| `reviewed` | revisão manual (hoje ausente) |
| `pct_coverage` | comentários classificados / com comentário |

## CSAT

| Campo | Descrição |
|-------|-----------|
| `csat_score` | Escala definida na fonte |
| `analytical_cycle_code` | Ciclo NPS vinculado |
| `valid_responses` | por ciclo em summary |

## Drivers

| Campo | Descrição |
|-------|-----------|
| `feature_key` | Variável testada |
| `direction` | associação com NPS |
| `effect_size` | magnitude proxy |
| `is_proxy` | derivação indireta |

## Action queue (`action_queue_enriched.json`)

| Campo | Descrição |
|-------|-----------|
| `priority` | Crítica / Alta / Média / Investigar |
| `priority_rules` | regras disparadas |
| `client_id`, `cycle_code` | chave |
| `critical_flag` | regra crítica NPS |
| `promotor_consistent` | promotor estável |
| Campos merge tracking | `status`, `owner`, `action_notes` |

## executive_diagnosis

| Campo | Descrição |
|-------|-----------|
| `headline`, `sections` | texto determinístico |
| `quality.flags` | limitações (`voc_unreviewed`, …) |
| `methodology` | cópia de `methodology.json` |
