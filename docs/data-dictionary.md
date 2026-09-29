# Dicionário de dados (file-based)

Persistência em `data/` — não há schema `analytics_nps` em Supabase.

## processed/cycles.json

Array de ciclos: `cycle_id`, `source_cycle_id`, `cycle_code`, `cycle_name`, `starts_at`, `ends_at`, `status`, `is_current`, …

## processed/responses.json

Unidade lógica `client_id + cycle_id`. Campos incluem `cycle_resolution_status` (`resolved` | `unresolved`), EP snapshot, histórico derivado, `raw_payload`.

## processed/eligible_clients.json

População de `nps_sends` por ciclo; `responded` cruzado com responses.

## outputs/action_queue.json

Prioridade Alta > Média > Investigar > Aprendizado por ciclo/cliente.

## quality/refresh_runs.json

Histórico de execuções do refresh.

## quality/data_quality.json

Warnings, dedupe, unresolved, EP proxy, validações.
