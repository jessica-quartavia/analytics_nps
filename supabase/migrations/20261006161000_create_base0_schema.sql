-- Business Data (rckpuebaiswrxzmywllv) — BASE0 construção (CSV). Não altera analytics_nps / nps_historico.

CREATE SCHEMA IF NOT EXISTS base0;

CREATE TABLE IF NOT EXISTS base0.import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  source_version text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  row_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  imported_by text
);

CREATE TABLE IF NOT EXISTS base0.clientes (
  id bigserial PRIMARY KEY,
  codigo_cliente text,
  base_qv_id uuid,
  nome text,
  email text,
  email_norm text,
  cpf_raw text,
  cpf_norm text,
  telefone text,
  telefone_norm text,
  renda numeric,
  aporte numeric,
  reserva numeric,
  data_nascimento date,
  localidade text,
  profissao text,
  funil text,
  data_entrada date,
  valor_entrada numeric,
  data_pagamento_entrada date,
  programa text,
  ep text,
  trocou_ep boolean,
  ep_anterior text,
  possui_dividas boolean,
  mecanismo_implantado boolean,
  data_primeira_implementacao date,
  nps_respondido boolean,
  nota_media_nps numeric,
  reunioes_realizadas integer,
  media_reunioes_mes numeric,
  indicacao_churn boolean,
  data_solicitacao_churn date,
  data_churn date,
  valor_reembolsado numeric,
  motivo_churn text,
  status_base_qv text,
  ciclo text,
  total_pago_programas numeric,
  qtd_pagamentos_programa integer,
  total_pago_cotas_mecanismos numeric,
  reembolso_programa_pagar numeric,
  acordos_reembolso numeric,
  dias_entrada_primeiro_pagamento integer,
  qtd_trocas_ep integer,
  data_ultima_troca_ep date,
  data_ultima_reuniao_realizada timestamptz,
  reunioes_futuras_agendadas integer,
  ultima_nota_nps numeric,
  imoveis_quitados_valor numeric,
  tipos_divida text,
  ficha_financeira_atualizada_em date,
  source_file text,
  import_run_id uuid REFERENCES base0.import_runs (id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clientes_codigo_cliente_unique UNIQUE (codigo_cliente)
);

CREATE TABLE IF NOT EXISTS base0.mecanismos_cliente (
  id_vinculo uuid PRIMARY KEY,
  base_qv_id uuid,
  codigo_cliente text,
  nome_cliente text,
  mecanismo_id uuid,
  mecanismo_nome text,
  status text,
  origem_registro text,
  data_implementacao date,
  data_real boolean,
  no_plano boolean,
  valor_aplicado numeric,
  chave text,
  source_file text,
  import_run_id uuid REFERENCES base0.import_runs (id),
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS base0.pagamentos_programa (
  id bigserial PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  fonte text,
  id_transacao text,
  data_pagamento date,
  nome text,
  cpf text,
  cpf_norm text,
  email text,
  produto_herospark text,
  oferta_codigo text,
  classificacao text,
  conta_como_programa boolean,
  valor numeric,
  valor_pago_comprador numeric,
  base_qv_id uuid,
  match_por text,
  source_file text,
  import_run_id uuid REFERENCES base0.import_runs (id),
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS base0.nps_respostas (
  id bigserial PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  codigo_cliente text,
  nome_cliente text,
  base_qv_id uuid,
  programa text,
  data_resposta date,
  nota integer,
  categoria text,
  ultima_resposta_cliente boolean,
  motivo_nota text,
  comentario_completo text,
  onda text,
  ultima_resposta_cliente_onda boolean,
  vinculo_cliente text,
  source_file text,
  import_run_id uuid REFERENCES base0.import_runs (id),
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS base0.reunioes (
  id bigserial PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  codigo_cliente text,
  nome_cliente text,
  base_qv_id uuid,
  tipo_reuniao text,
  nome_evento text,
  inicio_brasilia timestamptz,
  host text,
  email_convidado text,
  vinculada_manualmente boolean,
  registros_origem integer,
  source_file text,
  import_run_id uuid REFERENCES base0.import_runs (id),
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS base0.transferencias_ep (
  id bigserial PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  codigo_cliente text,
  nome_cliente text,
  base_qv_id uuid,
  ep_anterior text,
  ep_novo text,
  data_troca date,
  alterado_por_id uuid,
  observacao_log text,
  ordem integer,
  source_file text,
  import_run_id uuid REFERENCES base0.import_runs (id),
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS base0.acordos_reembolso (
  id bigserial PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  fonte text,
  mes_legado text,
  nome text,
  cpf text,
  cpf_norm text,
  programa text,
  status text,
  valor_total_acordo numeric,
  qtd_parcelas integer,
  data_primeiro_pagamento date,
  base_qv_id uuid,
  match_por text,
  source_file text,
  import_run_id uuid REFERENCES base0.import_runs (id),
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS base0.reembolsos_omie (
  id bigserial PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  vencimento date,
  previsao_pagamento date,
  nome_financeiro text,
  cpf_cnpj text,
  cpf_cnpj_norm text,
  categoria_financeira text,
  classe text,
  situacao text,
  grupo text,
  valor numeric,
  base_qv_id uuid,
  match_por text,
  source_file text,
  import_run_id uuid REFERENCES base0.import_runs (id),
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS base0.cotas_mecanismos (
  id bigserial PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  fonte text,
  documento text,
  parcela text,
  data date,
  nome_financeiro text,
  cpf_cnpj text,
  cpf_cnpj_norm text,
  categoria_financeira text,
  projeto_codigo text,
  situacao text,
  grupo text,
  valor numeric,
  base_qv_id uuid,
  match_por text,
  mecanismo_nome text,
  chave text,
  source_file text,
  import_run_id uuid REFERENCES base0.import_runs (id),
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS base0.pagantes_fora_base_qv (
  id bigserial PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  nome text,
  cpf text,
  cpf_norm text,
  email text,
  fontes text,
  primeiro_pagamento date,
  ultimo_pagamento date,
  qtd_pagamentos integer,
  total_pago numeric,
  source_file text,
  import_run_id uuid REFERENCES base0.import_runs (id),
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS base0.divergencias (
  id bigserial PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  codigo_cliente text,
  nome text,
  status_base_qv text,
  tipo_divergencia text,
  detalhe text,
  source_file text,
  import_run_id uuid REFERENCES base0.import_runs (id),
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS base0.premissas (
  id bigserial PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  tema text,
  premissa text,
  source_file text,
  import_run_id uuid REFERENCES base0.import_runs (id),
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS base0.mapa_mecanismos (
  id bigserial PRIMARY KEY,
  mecanismo_id uuid,
  codigo text,
  nome_base_qv text,
  coluna_base0 text,
  status_cadastro text,
  vinculos integer,
  concluidos integer,
  aptos integer,
  coluna_mecanismo_base0 text,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  source_file text,
  import_run_id uuid REFERENCES base0.import_runs (id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mapa_mecanismos_mec_id_unique UNIQUE (mecanismo_id)
);

CREATE TABLE IF NOT EXISTS base0.import_validations (
  id bigserial PRIMARY KEY,
  import_run_id uuid REFERENCES base0.import_runs (id),
  metric_key text NOT NULL,
  expected_count integer,
  actual_count integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_base0_clientes_base_qv ON base0.clientes (base_qv_id);
CREATE INDEX IF NOT EXISTS idx_base0_clientes_cpf_norm ON base0.clientes (cpf_norm);
CREATE INDEX IF NOT EXISTS idx_base0_clientes_email_norm ON base0.clientes (email_norm);
CREATE INDEX IF NOT EXISTS idx_base0_clientes_programa ON base0.clientes (programa);
CREATE INDEX IF NOT EXISTS idx_base0_clientes_ep ON base0.clientes (ep);
CREATE INDEX IF NOT EXISTS idx_base0_clientes_status ON base0.clientes (status_base_qv);

CREATE INDEX IF NOT EXISTS idx_base0_mec_base_qv ON base0.mecanismos_cliente (base_qv_id);
CREATE INDEX IF NOT EXISTS idx_base0_mec_codigo ON base0.mecanismos_cliente (codigo_cliente);
CREATE INDEX IF NOT EXISTS idx_base0_mec_mec_id ON base0.mecanismos_cliente (mecanismo_id);
CREATE INDEX IF NOT EXISTS idx_base0_mec_nome ON base0.mecanismos_cliente (mecanismo_nome);
CREATE INDEX IF NOT EXISTS idx_base0_mec_status ON base0.mecanismos_cliente (status);

CREATE INDEX IF NOT EXISTS idx_base0_nps_base_qv ON base0.nps_respostas (base_qv_id);
CREATE INDEX IF NOT EXISTS idx_base0_nps_codigo ON base0.nps_respostas (codigo_cliente);
CREATE INDEX IF NOT EXISTS idx_base0_nps_data ON base0.nps_respostas (data_resposta);
CREATE INDEX IF NOT EXISTS idx_base0_nps_onda ON base0.nps_respostas (onda);
CREATE INDEX IF NOT EXISTS idx_base0_nps_cat ON base0.nps_respostas (categoria);

CREATE INDEX IF NOT EXISTS idx_base0_div_codigo ON base0.divergencias (codigo_cliente);
CREATE INDEX IF NOT EXISTS idx_base0_div_tipo ON base0.divergencias (tipo_divergencia);
CREATE INDEX IF NOT EXISTS idx_base0_div_status ON base0.divergencias (status_base_qv);

CREATE INDEX IF NOT EXISTS idx_base0_trans_base_qv ON base0.transferencias_ep (base_qv_id);
CREATE INDEX IF NOT EXISTS idx_base0_trans_data ON base0.transferencias_ep (data_troca);

-- Views analíticas (derivadas; saldo financeiro exploratório)
CREATE OR REPLACE VIEW base0.v_cliente_nps AS
SELECT
  c.base_qv_id,
  c.codigo_cliente,
  count(n.id)::integer AS qtd_respostas,
  min(n.data_resposta) AS primeira_resposta,
  max(n.data_resposta) AS ultima_resposta,
  (array_agg(n.nota ORDER BY n.data_resposta DESC NULLS LAST))[1] AS ultima_nota,
  (array_agg(n.categoria ORDER BY n.data_resposta DESC NULLS LAST))[1] AS categoria_ultima,
  avg(n.nota)::numeric(10, 2) AS nota_media,
  array_agg(DISTINCT n.onda) FILTER (WHERE n.onda IS NOT NULL) AS ondas_respondidas
FROM base0.clientes c
LEFT JOIN base0.nps_respostas n
  ON n.base_qv_id = c.base_qv_id OR n.codigo_cliente = c.codigo_cliente
GROUP BY c.base_qv_id, c.codigo_cliente;

CREATE OR REPLACE VIEW base0.v_cliente_reunioes AS
SELECT
  base_qv_id,
  count(*)::integer AS qtd_reunioes,
  min(inicio_brasilia) AS primeira_reuniao,
  max(inicio_brasilia) FILTER (WHERE inicio_brasilia <= now()) AS ultima_reuniao,
  min(inicio_brasilia) FILTER (WHERE inicio_brasilia > now()) AS proxima_reuniao,
  count(*) FILTER (WHERE inicio_brasilia > now())::integer AS qtd_futuras,
  array_agg(DISTINCT tipo_reuniao) FILTER (WHERE tipo_reuniao IS NOT NULL) AS tipos_reuniao
FROM base0.reunioes
WHERE base_qv_id IS NOT NULL
GROUP BY base_qv_id;

CREATE OR REPLACE VIEW base0.v_cliente_mecanismos AS
SELECT
  base_qv_id,
  count(*)::integer AS qtd_mecanismos,
  count(*) FILTER (WHERE status ILIKE '%conclu%' OR status = 'apto')::integer AS qtd_implementados,
  count(*) FILTER (WHERE no_plano IS TRUE)::integer AS qtd_no_plano,
  min(data_implementacao) AS primeira_implementacao,
  max(data_implementacao) AS ultima_implementacao,
  sum(valor_aplicado) AS valor_aplicado_total
FROM base0.mecanismos_cliente
WHERE base_qv_id IS NOT NULL
GROUP BY base_qv_id;

CREATE OR REPLACE VIEW base0.v_cliente_financeiro AS
SELECT
  c.base_qv_id,
  c.codigo_cliente,
  c.total_pago_programas,
  c.qtd_pagamentos_programa,
  min(p.data_pagamento) AS primeiro_pagamento,
  max(p.data_pagamento) AS ultimo_pagamento,
  c.total_pago_cotas_mecanismos AS total_cotas_mecanismos,
  coalesce(sum(r.valor), 0) AS total_reembolsos,
  coalesce(sum(a.valor_total_acordo), 0) AS total_acordos,
  (
    coalesce(c.total_pago_programas, 0) + coalesce(c.total_pago_cotas_mecanismos, 0)
    - coalesce(sum(r.valor), 0) - coalesce(sum(a.valor_total_acordo), 0)
  ) AS saldo_liquido_exploratorio
FROM base0.clientes c
LEFT JOIN base0.pagamentos_programa p ON p.base_qv_id = c.base_qv_id
LEFT JOIN base0.reembolsos_omie r ON r.base_qv_id = c.base_qv_id
LEFT JOIN base0.acordos_reembolso a ON a.base_qv_id = c.base_qv_id
GROUP BY c.base_qv_id, c.codigo_cliente, c.total_pago_programas, c.qtd_pagamentos_programa, c.total_pago_cotas_mecanismos;

CREATE OR REPLACE VIEW base0.v_cliente_360 AS
SELECT
  c.*,
  fn.qtd_respostas,
  fn.ultima_nota,
  fn.nota_media AS nota_media_nps_calc,
  fr.qtd_reunioes,
  fr.ultima_reuniao,
  fm.qtd_mecanismos,
  fm.valor_aplicado_total,
  ff.total_reembolsos,
  ff.saldo_liquido_exploratorio,
  (SELECT count(*)::integer FROM base0.divergencias d WHERE d.codigo_cliente = c.codigo_cliente) AS qtd_divergencias
FROM base0.clientes c
LEFT JOIN base0.v_cliente_nps fn ON fn.codigo_cliente = c.codigo_cliente
LEFT JOIN base0.v_cliente_reunioes fr ON fr.base_qv_id = c.base_qv_id
LEFT JOIN base0.v_cliente_mecanismos fm ON fm.base_qv_id = c.base_qv_id
LEFT JOIN base0.v_cliente_financeiro ff ON ff.codigo_cliente = c.codigo_cliente;

ALTER TABLE base0.import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE base0.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE base0.mecanismos_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE base0.pagamentos_programa ENABLE ROW LEVEL SECURITY;
ALTER TABLE base0.nps_respostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE base0.reunioes ENABLE ROW LEVEL SECURITY;
ALTER TABLE base0.transferencias_ep ENABLE ROW LEVEL SECURITY;
ALTER TABLE base0.acordos_reembolso ENABLE ROW LEVEL SECURITY;
ALTER TABLE base0.reembolsos_omie ENABLE ROW LEVEL SECURITY;
ALTER TABLE base0.cotas_mecanismos ENABLE ROW LEVEL SECURITY;
ALTER TABLE base0.pagantes_fora_base_qv ENABLE ROW LEVEL SECURITY;
ALTER TABLE base0.divergencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE base0.premissas ENABLE ROW LEVEL SECURITY;
ALTER TABLE base0.mapa_mecanismos ENABLE ROW LEVEL SECURITY;
ALTER TABLE base0.import_validations ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA base0 TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA base0 TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA base0 TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA base0 GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA base0 GRANT USAGE, SELECT ON SEQUENCES TO service_role;

COMMENT ON SCHEMA base0 IS 'BASE0 construção — CSV Construção_BASE0.xlsx (rastreável via import_runs)';
COMMENT ON VIEW base0.v_cliente_financeiro IS 'Saldo exploratório — não substitui financeiro oficial';
