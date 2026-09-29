# Matriz de filtros globais — Analytics NPS

Estado único (`global-filters.js`): `cycleCode`, `ep`, `category`, `scoreMin`, `scoreMax`, `deltaMin`, `deltaMax`, `base`, `topic`, `valence`, `hasCsat`, `priority`, `migrationCell`, `search` (+ opções VoC locais).

Implementação: `getGlobalFilterContext(cycleCode, filters)` → `buildGlobalFilterContext` em `dashboard/js/filters/filter-context.mjs`.

Legenda: **SIM** = visual recalculado ou filtrado de forma explícita · **PARCIAL** = parte oficial, parte recorte · **NÃO** = permanece agregado oficial (com banner quando o recorte não se aplica).

## Por filtro

| Filtro | Executivo | Movimento | EPs | VoC | Drivers | Plano |
|--------|-----------|-----------|-----|-----|---------|-------|
| Ciclo | SIM | SIM | SIM | SIM | SIM | SIM |
| EP | SIM (recorte) | SIM | SIM | SIM | NÃO* | SIM |
| Categoria | SIM (recorte) | SIM | PARCIAL** | SIM | NÃO* | SIM |
| Nota min/max | SIM (recorte) | SIM | PARCIAL** | SIM | NÃO* | NÃO*** |
| Delta min/max | SIM (recorte) | SIM | SIM (Δ EP) | NÃO | NÃO* | NÃO*** |
| Base total/pareada | SIM (recorte) | SIM | SIM | NÃO**** | NÃO | NÃO*** |
| Tema | NÃO | NÃO | NÃO | SIM | NÃO* | SIM |
| Valência | NÃO | NÃO | NÃO | SIM | NÃO* | NÃO |
| Possui CSAT | NÃO | SIM | NÃO | NÃO | NÃO | SIM |
| Prioridade | NÃO | SIM | NÃO | NÃO | NÃO | SIM |
| Status ação | NÃO | NÃO | NÃO | NÃO | NÃO | Local***** |

\* Drivers usam filtros locais (outcome / significância), não EP/categoria global.  
\*\* EPs: bubble/dispersão não aplica categoria/nota; tabela e KPIs por EP sim.  
\*\*\* Plano: nota/delta/base não existem na fila enriquecida como filtro global adicional além de categoria/EP.  
\*\*\*\* VoC opera no universo de comentários do ciclo; base pareada não altera denominador VoC.  
\*\*\*\*\* Status é filtro local da página Plano (`tableState.actionStatus`).

## Por página (blocos)

### Executivo
- **KPIs NPS / composição / distribuição / comparativo recorte**: SIM com recorte ativo (`isClientRecorteActive`).
- **Clientes com envio, taxa, IC95, histórico multi-ciclo, diagnóstico executivo**: NÃO (oficial + banner).
- **Drawer respondentes**: SIM (herda recorte global + busca local).

### Movimento
- **KPIs movimento, delta bands, tabelas, drawer cliente**: SIM.
- **Matriz 3×3 e fluxo**: SIM quando recorte altera conjunto de clientes; caso contrário matriz processada oficial.
- **Chips prioridade**: contagem reflete fila filtrada por prioridade quando chip ativo.

### Eng. Patrimoniais
- **Tabela / KPIs agregados EP**: SIM (EP, delta, base pareada, recorte categoria/nota).
- **Hero NPS**: summary oficial do ciclo (PARCIAL).

### Voz do Cliente
- **Tabela comentários, matriz tema×valência**: SIM.
- **KPIs VoC**: SIM quando tema/valência/EP/categoria/busca ou recorte cliente.
- **Ranking topic_summary agregado**: NÃO (documentado na UI como visão global).

### Drivers
- **Testes estatísticos / summary processado**: NÃO para filtros globais de cliente.
- **Tabela comentários-drivers**: filtros locais da página.

### Plano de Ação
- **KPIs funil e tabela**: SIM (`filterActionPlanRows`).
- **Status**: filtro local da página.

## Base total × pareada

- **Total**: todas as respostas válidas do ciclo (após dedupe no pipeline).
- **Pareada**: interseção com `paired_client_ids` do par analítico atual.
- KPIs que usam `filterResponses` com `base: 'paired'` nunca misturam denominadores.

## Recorte vs oficial

Quando `isClientRecorteActive` é verdadeiro, o dashboard **não** exibe NPS/composição do `cycle_summary` como se fossem filtrados. Usa `summaryLikeFromResponses` sobre `rowsCurrent`.
