# Fontes de dados

## Política BASE QV

**READ ONLY — somente SELECT.**  
O projeto `analytics-nps` **não** grava analytics no Supabase. Persistência analítica = arquivos em `data/`.

## Tabela de fontes

| Fonte (BASE QV) | Finalidade | Modo | Snapshot raw | Chave / join | Temporalidade | Qualidade |
|-----------------|------------|------|--------------|--------------|---------------|-----------|
| `nps_cycles` | Campanhas operacionais → ciclos analíticos | SELECT | `nps_cycles.json` | `cycle_id`, datas | Por campanha | Alta |
| `nps_responses` | Notas e comentários NPS | SELECT | `nps_responses.json` | `client_id`, `cycle_id` | Por resposta | Dedupe no pipeline |
| `nps_sends` | Base elegível / envios | SELECT | `nps_sends.json` | `client_id`, ciclo | Por envio | Pode incompletar histórico |
| `clients` | Cadastro, EP, programa | SELECT | `clients.json` | `id`, `codigo` | Lenta | RLS — requer service_role no refresh |
| `client_journeys` | Estágio jornada | SELECT | `client_journeys.json` | `client_id` | Evento | Média |
| `journey_stages` | Catálogo estágios | SELECT | `journey_stages.json` | `id` | Estável | Alta |
| `engenheiro_transfer_logs` | Histórico EP | SELECT | `engenheiro_transfer_logs.json` | `client_id`, datas | Evento | Média |
| `engenheiros_patrimoniais` | Catálogo EP | SELECT | `engenheiros_patrimoniais.json` | `id`, `name` | Estável | Alta |
| `csat_responses` | CSAT | SELECT | `csat_responses.json` | `client_id` | Por resposta | Lacunas por ciclo |

### Marcos da jornada (ETAPA 4.3 — opcionais no raw snapshot)

| Fonte | Snapshot raw | Regra temporal |
|-------|--------------|----------------|
| `client_meetings`, `manual_meetings` | `client_meetings.json`, `manual_meetings.json` | `start_time <= submitted_at` |
| `client_mecanismos` | `client_mecanismos.json` | `implemented_at <= submitted_at` (sem data → não vira histórico) |
| `cancellations`, `cancellation_history`, `retention_contact_log` | homônimos `.json` | evento `<= submitted_at` |
| `client_engajamento_history` | `client_engajamento_history.json` | estado reconstruído em `submitted_at` |
| `freeze_change_requests` | `freeze_change_requests.json` | pedidos/conclusões de congelamento `<= submitted_at` |

Export SELECT-only das fontes acima (escopo `client_id` PHARUS): `npm run export:milestone-sources -- [snapshotId]` ou no `npm run refresh:nps` (novo raw). QA: `quality/milestone_sources_export_qa.json`.

Artefatos: `processed/nps_client_milestones.json`, `nps_milestones_summary.json`, `nps_between_cycle_events.json`, `quality/nps_milestones_qa.json`. Gerar com `npm run generate:nps-milestones` (também no refresh NPS).

### Perfil financeiro / Tier (ETAPA 4.6 — auditoria, não no dashboard)

| Fonte | Uso analítico | Export snapshot | Temporalidade |
|-------|---------------|-----------------|---------------|
| `client_financial_data` | reserva, renda, aporte, flags débito | **Pendente** (`client_financial_data.json`) | `updated_at` — **current_proxy** (sem histórico) |
| `client_strategic_data` | SWOT / metas (texto) | Pendente | current_proxy; cobertura baixa |
| `contratos_pharus` | reserva/renda/aporte na assinatura | Pendente | onboarding (`signed_at`) |
| Tier T1–T4 | — | **Não encontrado** no schema | Não recalcular Tier no analytics |

Auditoria: `node scripts/audit-financial-sources.mjs` → `quality/nps_financial_sources_audit.json`.

## Config local (não BASE QV)

| Fonte | Finalidade |
|-------|------------|
| `data/config/nps-cycles.json` | Definição ciclos analíticos |
| `data/config/methodology.json` | Versões de método |
| `data/operational/action_tracking.json` | Status operacional fila (local) |

## Ingest alternativo

Snapshots em `data/raw/<id>/` podem ser produzidos por import (`ANALYTICS_INGEST_SNAPSHOT`) sem novo SELECT — ver `docs/TROUBLESHOOTING.md`.
