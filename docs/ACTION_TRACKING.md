# Action tracking em produção

## Comportamento atual

- **Arquivo:** `data/operational/action_tracking.json`
- **Merge:** no carregamento do dashboard, entradas de tracking sobrepõem campos operacionais (status, owner, notas) na fila enriquecida.
- **Refresh NPS:** **não** apaga nem reescreve `action_tracking.json` — apenas lê para diagnóstico.

## Persistência

| Ambiente | Escrita |
|----------|---------|
| `npm run dev` | **Sim** — `POST /api/operational/action_tracking` |
| Deploy estático (CDN/hosting files) | **Não** — tracking **read-only** |

Não há backend persistente em produção hoje. A UI exibe hint: alterações salvas localmente via dev server.

## Opções futuras (não implementadas)

### A) Tracking somente local

- Time usa `npm run dev` ou copia manual de `action_tracking.json` versionado (cuidado com PII).
- Deploy continua estático.

### B) Backend persistente separado

- API dedicada (ex.: Supabase projeto **diferente** da BASE QV, ou serviço interno).
- Dashboard passa a chamar API autenticada.
- **Não** implementar escrita na BASE QV operacional.

## QA

`npm run qa:final` verifica que o arquivo de tracking não foi removido pelo pipeline.
