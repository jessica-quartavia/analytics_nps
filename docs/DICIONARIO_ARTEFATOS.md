# Dicionário de artefatos (JSON)

Caminhos relativos à raiz `analytics-nps/`.

| Arquivo | Granularidade | Chaves principais | Gerado por | Consumido por |
|---------|---------------|-------------------|------------|---------------|
| `data/processed/cycles.json` | 1 row/ciclo analítico | `cycle_code`, `sequence`, `cycle_name` | refresh | Dashboard filtros |
| `data/processed/responses.json` | 1 row/resposta | `client_id`, `analytical_cycle_code`, `nps_score`, `comment` | refresh | Todas páginas |
| `data/processed/cycle_summary.json` | doc + array cycles | `data_cutoff`, `cycles[].nps`, P/N/D | refresh | Executivo, QA |
| `data/processed/eligible_clients.json` | 1 row/cliente-ciclo | `analytical_cycle_code`, send meta | refresh | QA, elegibilidade |
| `data/processed/paired_cycles.json` | doc ciclo atual | `current_cycle`, `paired_clients`, métricas | refresh | Movimento, Executivo |
| `data/processed/migration_matrix.json` | matriz segmentos | from/to buckets | refresh | Movimento |
| `data/processed/ep_summary.json` | 1 row/EP/ciclo | `ep_id`, `nps`, `n` | refresh | EP page |
| `data/processed/response_topics.json` | 1 row/resposta c/ tema | `topic_id`, `valence`, `confidence` | refresh | VoC |
| `data/processed/topic_summary.json` | temas agregados | `entries`, `classification` | refresh | VoC, diagnóstico |
| `data/processed/csat_responses.json` | resposta CSAT | `score`, ciclo analítico | refresh | CSAT views |
| `data/processed/csat_summary.json` | por ciclo | médias, `valid_responses` | refresh | Movimento, plano |
| `data/processed/client_satisfaction_summary.json` | por cliente | último CSAT | refresh | Plano, movimento |
| `data/processed/driver_features.json` | features | client/cycle features | refresh | drivers pipeline |
| `data/processed/driver_tests.json` | testes | associação, p-value proxy | refresh | Drivers page |
| `data/processed/drivers_summary.json` | resumo ciclo | top drivers | refresh | Drivers, diagnóstico |
| `data/processed/comment_drivers.json` | comentário | driver tags | refresh | Drivers drawer |
| `data/outputs/action_queue.json` | fila base | `priority`, `client_id` | refresh | Legacy/export |
| `data/processed/action_queue_enriched.json` | fila enriquecida | regras, temas, CSAT | refresh | Plano de ação |
| `data/processed/executive_diagnosis.json` | 1 doc/ciclo | narrative, flags, methodology | refresh | Executivo |
| `data/operational/action_tracking.json` | entradas operacionais | `status`, `owner` | dev API / manual | Plano (merge) |
| `data/snapshots/latest.json` | ponteiro | `refresh_id`, `status`, `methodology` | refresh (success) | healthcheck, UI |
| `data/snapshots/runs/<uuid>.json` | manifest run | counts, checksums leves | refresh (success) | auditoria |
| `data/raw/<ts>/manifest.json` | manifest ingest | `source_counts`, methodology | refresh | auditoria |
| `data/quality/refresh_runs.json` | histórico runs | `status`, timings | refresh | healthcheck |
| `data/quality/cross_page_consistency.json` | QA | `status`, diffs | qa:final | healthcheck |
| `data/config/methodology.json` | versões | `*_version` | manual | pipeline, UI |
