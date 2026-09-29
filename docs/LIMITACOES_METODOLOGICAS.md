# Limitações metodológicas

Transparência para leitura executiva e fechamento de ciclo. Não substituem decisões de negócio.

## NPS

- **Jun–Jul/2026** é ciclo analítico **reconstruído** a partir de fontes BASE QV + regras de mapeamento; não é export 1:1 histórico legado.
- **Gap histórico de 7** respostas vs referência externa (262) documentado em QA — status partial aceito após baseline ETAPA 2.3.
- Dedupe e elegibilidade seguem config analítica; mudanças de config alteram séries.

## Engenheiros patrimoniais (EP)

- Atribuição histórica por data (`resolveEpAtDate`); **current_proxy** pode ser alto quando carteira mudou recentemente.
- EP summary agrega por proxy no ciclo — não substitui auditoria individual de carteira.

## Voz do Cliente (VoC)

- Classificador **`rules_v1`** (determinístico, sem LLM).
- **0% reviewed** manualmente no fluxo atual — temas são sugestão automática.
- Confiança média ~**0,73** (varia por ciclo); comentários ambíguos podem ficar sem tema.

## CSAT

- Nem todos os ciclos têm sends CSAT simétricos aos ciclos NPS.
- Regra legado **60,3%** não totalmente reconciliada — ver `data/quality/csat_legacy_reconciliation.json`.

## Drivers

- Resultados indicam **associação**, não causalidade.
- Uso de **proxies** (EP, jornada, etc.) quando feature direta ausente.
- Cobertura de testes limitada ao universo com feature disponível — interpretar magnitude com cautela.

## Fila de ação (action queue)

- Prioridade **Investigar** sensível à regra “≥2 temas negativos entre promotores” — em calibração/revisão (`qa:final`).
- Fila enriquecida é regenerada a cada refresh; **tracking** (`action_tracking.json`) é separado e pode ficar desatualizado vs novos clientes na fila.

## Diagnóstico executivo

- Texto gerado por regras fixas sobre artefatos — não é parecer jurídico/compliance.
- Flags (`partial_cycle`, `voc_unreviewed`, etc.) devem ser lidas junto com este documento.
