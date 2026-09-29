# Checklist de fechamento de ciclo

Marcar antes de considerar o ciclo **fechado** e publicado.

## Ciclo e dados

- [ ] Novo ciclo identificado (ou ciclo corrente confirmado)
- [ ] Datas validadas em `nps-cycles.json`
- [ ] Respostas carregadas (refresh success)
- [ ] Dedupe validado (contagens em `refresh_runs`)
- [ ] NPS calculado por ciclo analítico
- [ ] P / N / D conferidos na UI Executivo
- [ ] Base elegível conferida (`eligible_clients`)
- [ ] Taxa de resposta conferida (`cycle_summary`)

## Artefatos analíticos

- [ ] Base pareada gerada (`paired_cycles.json`)
- [ ] Migração gerada (`migration_matrix.json`)
- [ ] EP summary gerado (`ep_summary.json`)
- [ ] VoC gerado (`topic_summary`, `response_topics`)
- [ ] Cobertura VoC revisada
- [ ] CSAT processado (`csat_summary.json`)
- [ ] Drivers processados (`drivers_summary.json`)
- [ ] Action queue gerada (`outputs/action_queue.json` + `action_queue_enriched.json`)
- [ ] Diagnóstico executivo gerado (`executive_diagnosis.json`)

## Qualidade e publicação

- [ ] QA final passou (`npm run qa:final`)
- [ ] Cross-page consistency **PASS**
- [ ] Testes passaram (`npm test`)
- [ ] Smoke passou (`npm run smoke:dashboard`)
- [ ] Healthcheck exit 0 (`npm run healthcheck`)
- [ ] Limitações revisadas (`docs/LIMITACOES_METODOLOGICAS.md`)
- [ ] Deploy concluído (artefatos corretos, sem secrets)

## Pós-deploy

- [ ] `#/executivo` — diagnóstico coerente
- [ ] `#/plano-de-acao` — fila visível
- [ ] Chip “Atualizado” com data de corte esperada
- [ ] Action tracking: expectativa alinhada (read-only se estático)
