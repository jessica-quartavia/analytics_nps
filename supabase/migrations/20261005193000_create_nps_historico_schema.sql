-- Business Data (rckpuebaiswrxzmywllv) — histórico NPS PHARUS consolidado (somente este schema).

CREATE SCHEMA IF NOT EXISTS nps_historico;

CREATE TABLE IF NOT EXISTS nps_historico.respostas (
  id bigserial PRIMARY KEY,
  chave_import text NOT NULL,
  ciclo text,
  ciclo_nome text,
  data_resposta timestamptz,
  cliente text,
  id_cliente text,
  programa text,
  ep text,
  nota_nps numeric,
  categoria text,
  nota_estrategista numeric,
  nota_backoffice numeric,
  nota_qv360 numeric,
  nota_arquitetura_patrimonial numeric,
  plano_patrimonial text,
  plano_apresentado text,
  caminho text,
  momento text,
  motivo_nota text,
  melhoria text,
  razao_positiva text,
  retencao_5_anos text,
  comentario_adicional text,
  reunioes_realizadas text,
  inicio_programa text,
  versao_formulario text,
  fonte_arquivo text,
  fonte_aba text,
  id_resposta text,
  ref_programa text,
  ref_ep text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT respostas_chave_import_unique UNIQUE (chave_import)
);

CREATE TABLE IF NOT EXISTS nps_historico.medicoes (
  ciclo text PRIMARY KEY,
  medicao text,
  janela_datas text,
  respostas integer,
  promotores integer,
  neutros integer,
  detratores integer,
  pct_promotores numeric,
  pct_detratores numeric,
  nps numeric,
  nota_media numeric,
  painel_oficial_respostas integer,
  painel_oficial_nps numeric,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nps_historico.arquivos_recebidos (
  id bigserial PRIMARY KEY,
  arquivo_recebido text NOT NULL,
  tipo text,
  conteudo text,
  periodo text,
  linhas numeric,
  como_foi_usado text,
  respostas_consolidado integer,
  linhas_excluidas_consolidacao integer,
  observacao text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arquivos_recebidos_dedup UNIQUE (arquivo_recebido, periodo, tipo)
);

CREATE TABLE IF NOT EXISTS nps_historico.excluidos (
  id bigserial PRIMARY KEY,
  motivo_exclusao text,
  data_resposta timestamptz,
  cliente text,
  nota_nps numeric,
  fonte_arquivo text,
  fonte_aba text,
  id_resposta text,
  ref_programa text,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nps_historico.motivos_exclusao (
  motivo text PRIMARY KEY,
  linhas integer NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nps_historico_respostas_ciclo ON nps_historico.respostas (ciclo);
CREATE INDEX IF NOT EXISTS idx_nps_historico_respostas_data_resposta ON nps_historico.respostas (data_resposta);
CREATE INDEX IF NOT EXISTS idx_nps_historico_respostas_id_cliente ON nps_historico.respostas (id_cliente);
CREATE INDEX IF NOT EXISTS idx_nps_historico_respostas_ep ON nps_historico.respostas (ep);
CREATE INDEX IF NOT EXISTS idx_nps_historico_excluidos_motivo ON nps_historico.excluidos (motivo_exclusao);

ALTER TABLE nps_historico.respostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_historico.medicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_historico.arquivos_recebidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_historico.excluidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_historico.motivos_exclusao ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA nps_historico TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA nps_historico TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA nps_historico TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA nps_historico
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA nps_historico
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

ALTER ROLE authenticator SET pgrst.db_schemas TO
  public,
  graphql_public,
  storage,
  clusterizacao_pharus,
  bl_test,
  dw_bitrix,
  contracts_app,
  match_ep_pharus,
  acionamentos_tech,
  documentacao_quartavia,
  check_link_ep,
  _dashboard_ferramentas,
  analytics_nps,
  nps_historico;

NOTIFY pgrst, 'reload config';

COMMENT ON SCHEMA nps_historico IS 'Histórico consolidado NPS PHARUS (planilha/CSV) — separado de analytics_nps operacional';
