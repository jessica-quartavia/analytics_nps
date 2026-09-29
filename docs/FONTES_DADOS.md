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

## Config local (não BASE QV)

| Fonte | Finalidade |
|-------|------------|
| `data/config/nps-cycles.json` | Definição ciclos analíticos |
| `data/config/methodology.json` | Versões de método |
| `data/operational/action_tracking.json` | Status operacional fila (local) |

## Ingest alternativo

Snapshots em `data/raw/<id>/` podem ser produzidos por import (`ANALYTICS_INGEST_SNAPSHOT`) sem novo SELECT — ver `docs/TROUBLESHOOTING.md`.
