# Rotina mensal — Analytics NPS

Documento operacional para fechar um novo ciclo analítico. Não altera metodologia de cálculo.

## Pré-requisitos

- Node.js LTS instalado
- `.env` com credenciais BASE QV (somente leitura) para refresh
- Acesso ao repositório `analytics-nps`
- Novas respostas disponíveis na BASE QV (ou snapshot de ingest documentado)

---

## PASSO 1 — Preparar / validar novo ciclo

- Confirmar código do ciclo analítico (ex.: `NPS-2026-SET-PHARUS`).
- Validar datas de campanha e data de corte esperada.
- Verificar se há respostas novas na fonte.
- `npm run status` — visão rápida do estado atual.

## PASSO 2 — Atualizar ciclos (se necessário)

Editar **somente se houver novo ciclo**:

`data/config/nps-cycles.json`

Commitar alteração de config antes do refresh.

## PASSO 3 — Refresh completo

```bash
npm run refresh:nps
```

- Aguardar **SUCCESS** no terminal.
- Em falha: corrigir causa; **processed/latest não são atualizados** — investigar `data/quality/refresh_runs.json`.

## PASSO 4 — QA final

```bash
npm run qa:final
```

- Conferir `data/quality/cross_page_consistency.json` → deve estar **pass**.
- Revisar calibração da fila (`action_queue_calibration.json`) se houver alertas.

## PASSO 5 — Testes

```bash
npm test
```

Todos devem passar.

## PASSO 6 — Smoke do dashboard

```bash
npm run smoke:dashboard
```

Valida rotas principais em viewports 375 / 768 / 1280 / 1600 (sobe servidor local automaticamente).

## PASSO 7 — Validar diagnóstico executivo

Abrir:

```text
http://localhost:5173/#/executivo
```

(ou URL de preview/deploy)

- Ler “Leitura executiva” e abrir diagnóstico completo.
- Conferir NPS, P/N/D, flags e perguntas de gestão.

## PASSO 8 — Revisar qualidade

Pasta `data/quality/`:

- `refresh_runs.json` — última execução success
- `data_quality.json` — warnings/errors
- `methodological_qa.json` — resumo QA

## PASSO 9 — Validar action queue

Rota `#/plano-de-acao`:

- Tamanho da fila coerente com ciclo
- Prioridades (Crítica / Alta / Média / Investigar)
- Tracking operacional (se dev server): status/owner

## PASSO 10 — Publicar / deploy

```bash
npm run validate
```

Publicar artefatos estáticos (ver README — seção Deploy).

Após deploy: smoke manual em `#/executivo` e `#/plano-de-acao`.

---

## Comandos de apoio

| Comando | Função |
|---------|--------|
| `npm run healthcheck` | Blockers vs warnings antes de publicar |
| `npm run status` | Checagem rápida |
| `npm run validate` | healthcheck + test + smoke |

Checklist detalhado: `docs/CHECKLIST_FECHAMENTO_CICLO.md`.
