#!/usr/bin/env node
/**
 * Importa CSVs Construção_BASE0 → schema base0 (Business Data rckp).
 * Requer: ANALYTICS_NPS_SUPABASE_URL + ANALYTICS_NPS_SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { connectBase0, upsertBatches as upsertPg } from '../lib/base0/db.mjs';
import {
  readCsvRows,
  rowsToObjects,
  blankToNull,
  parseBoolPt,
  parseMoneyBr,
  parseDecimalBr,
  parseIntSafe,
  parseUuid,
  parseDateBr,
  parseDateTimeBr,
  digitsOnly,
  normEmail,
  dedupeHash,
} from '../lib/base0/parse.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..');
dotenv.config({ path: join(root, '.env') });

const SOURCE_VERSION = 'Construção_BASE0.xlsx';

const FILES = {
  base: 'Construção_BASE0.xlsx - Base.csv',
  premissas: 'Construção_BASE0.xlsx - Premissas.csv',
  pagantes: 'Construção_BASE0.xlsx - Pagantes_fora_BaseQV.csv',
  divergencias: 'Construção_BASE0.xlsx - Divergencias.csv',
  nps: 'Construção_BASE0.xlsx - NPS.csv',
  reunioes: 'Construção_BASE0.xlsx - Reunioes.csv',
  transferencias: 'Construção_BASE0.xlsx - Transferencias_EP.csv',
  acordos: 'Construção_BASE0.xlsx - Acordos_Reembolso.csv',
  reembolsos: 'Construção_BASE0.xlsx - Reembolsos_OMIE.csv',
  mec: 'Construção_BASE0.xlsx - Mec_BaseQV.csv',
  cotas: 'Construção_BASE0.xlsx - Cotas_Mecanismos.csv',
  pagamentos: 'Construção_BASE0.xlsx - Pagamentos_Programa.csv',
  mapa: 'Construção_BASE0.xlsx - Mapa_Mecanismos.csv',
};

function csvPath(name) {
  const p = join(repoRoot, name);
  if (!existsSync(p)) throw new Error(`CSV ausente: ${p}`);
  return p;
}

function loadCsv(name) {
  const text = readFileSync(csvPath(name), 'utf8');
  return readCsvRows(text);
}

const CONFLICT = {
  clientes: 'codigo_cliente',
  mecanismos_cliente: 'id_vinculo',
  mapa_mecanismos: 'mecanismo_id',
};

function createSupabase() {
  const url = process.env.ANALYTICS_NPS_SUPABASE_URL;
  const key = process.env.ANALYTICS_NPS_SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.includes('rckp') || !key) {
    throw new Error('Configure ANALYTICS_NPS_SUPABASE_URL (rckp) e SERVICE_ROLE_KEY no .env');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function upsertRpc(sb, entity, rows, batchSize = 80) {
  const conflict = CONFLICT[entity] ?? 'dedupe_key';
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await sb.rpc('base0_import_batch', {
      p_entity: entity,
      p_rows: chunk,
    });
    if (error) throw new Error(`${entity}: ${error.message}`);
  }
  void conflict;
}

function createTransport() {
  try {
    const pg = connectBase0();
    return {
      mode: 'postgres',
      pg,
      async startRun(filesList) {
        const [runRow] = await pg`
          insert into base0.import_runs (source_name, source_version, status, files, imported_by)
          values (
            ${SOURCE_VERSION},
            ${new Date().toISOString().slice(0, 10)},
            'running',
            ${pg.json(filesList)},
            'scripts/import-base0.mjs'
          )
          returning id
        `;
        return runRow.id;
      },
      upsert(entity, rows) {
        return upsertPg(pg, `base0.${entity}`, rows, CONFLICT[entity] ?? 'dedupe_key');
      },
      async finishRun(runId, payload) {
        await pg`
          update base0.import_runs
          set
            status = ${payload.status},
            finished_at = now(),
            row_counts = ${pg.json(payload.rowCounts)},
            warnings = ${pg.json(payload.warnings)},
            errors = ${pg.json(payload.errors ?? [])}
          where id = ${runId}
        `;
      },
      async insertValidations(rows) {
        if (rows.length) await pg`insert into base0.import_validations ${pg(rows)}`;
      },
      async sanity() {
        return sanityReportPg(pg);
      },
      async close() {
        await pg.end({ timeout: 5 });
      },
    };
  } catch {
    const sb = createSupabase();
    return {
      mode: 'rpc',
      sb,
      async startRun(filesList) {
        const { data, error } = await sb.rpc('base0_import_run_start', {
          p_source_name: SOURCE_VERSION,
          p_source_version: new Date().toISOString().slice(0, 10),
          p_files: filesList,
          p_imported_by: 'scripts/import-base0.mjs',
        });
        if (error) throw new Error(error.message);
        return data;
      },
      upsert(entity, rows) {
        return upsertRpc(sb, entity, rows);
      },
      async finishRun(runId, payload) {
        const { error } = await sb.rpc('base0_import_run_finish', {
          p_run_id: runId,
          p_status: payload.status,
          p_row_counts: payload.rowCounts,
          p_warnings: payload.warnings,
          p_errors: payload.errors ?? [],
        });
        if (error) throw new Error(error.message);
      },
      async insertValidations(rows) {
        if (!rows.length) return;
        const { error } = await sb.rpc('base0_import_validations', { p_rows: rows });
        if (error) throw new Error(error.message);
      },
      async sanity() {
        const { data, error } = await sb.rpc('base0_import_sanity');
        if (error) throw new Error(error.message);
        return data;
      },
      async close() {},
    };
  }
}

function loadBaseClientes(sourceFile, runId, warnings) {
  const rows = loadCsv(FILES.base);
  if (rows.length < 3) return [];
  const header = rows[1];
  const data = rows.slice(2);
  const objs = rowsToObjects(header, data);
  const out = [];
  for (const o of objs) {
    const codigo = blankToNull(o.Id);
    if (!codigo || !/^QV/i.test(codigo)) continue;
    const cpfRaw = blankToNull(o.CPF);
    out.push({
      codigo_cliente: codigo,
      base_qv_id: parseUuid(o['ID BASE QV (UUID)']),
      nome: blankToNull(o.Nome),
      email: blankToNull(o.Email),
      email_norm: normEmail(o.Email),
      cpf_raw: cpfRaw,
      cpf_norm: digitsOnly(cpfRaw),
      telefone: blankToNull(o.Telefone),
      telefone_norm: digitsOnly(o.Telefone),
      renda: parseMoneyBr(o.Renda),
      aporte: parseMoneyBr(o.Aporte),
      reserva: parseMoneyBr(o.Reserva),
      data_nascimento: parseDateBr(o['Data de Nascimento']),
      localidade: blankToNull(o.Localidade),
      profissao: blankToNull(o.Profissão),
      funil: blankToNull(o.Funil),
      data_entrada: parseDateBr(o['Data de Entrada']),
      valor_entrada: parseMoneyBr(o['Valor de entrada']),
      data_pagamento_entrada: parseDateBr(o['Data pagamento']),
      programa: blankToNull(o.Programa),
      ep: blankToNull(o.EP),
      trocou_ep: parseBoolPt(o['Trocou de EP']),
      ep_anterior: blankToNull(o['Ep anterior']),
      possui_dividas: parseBoolPt(o['Possui dividas']),
      mecanismo_implantado: parseBoolPt(o['Mecanismo Implantado']),
      data_primeira_implementacao: parseDateBr(o['Dt da primeira implementação']),
      nps_respondido: parseBoolPt(o['NPS respondido']),
      nota_media_nps: parseDecimalBr(o['Nota média NPS']),
      reunioes_realizadas: parseIntSafe(o['Reuniões realizadas']),
      media_reunioes_mes: parseDecimalBr(o['Médias de reunião por mês']),
      indicacao_churn: parseBoolPt(o['Indicação de churn']),
      data_solicitacao_churn: parseDateBr(o['Data solicitação']),
      data_churn: parseDateBr(o['Data Churn']),
      valor_reembolsado: parseMoneyBr(o['Valor reembolsado']),
      motivo_churn: blankToNull(o['Motivo categorizado']),
      status_base_qv: blankToNull(o['Status BASE QV']),
      ciclo: blankToNull(String(o.Ciclo ?? '')),
      total_pago_programas: parseMoneyBr(o['Total pago em programas']),
      qtd_pagamentos_programa: parseIntSafe(o['Qtd pagamentos de programa']),
      total_pago_cotas_mecanismos: parseMoneyBr(o['Total pago em cotas de mecanismos']),
      reembolso_programa_pagar: parseMoneyBr(o['Reembolso de programa a pagar']),
      acordos_reembolso: parseMoneyBr(o['Acordos de reembolso (Legado e Novos)']),
      dias_entrada_primeiro_pagamento: parseIntSafe(o['Dias entre entrada e 1º pagamento']),
      qtd_trocas_ep: parseIntSafe(o['Qtd trocas de EP']),
      data_ultima_troca_ep: parseDateBr(o['Data da última troca de EP']),
      data_ultima_reuniao_realizada: parseDateTimeBr(o['Data da última reunião realizada']),
      reunioes_futuras_agendadas: parseIntSafe(o['Reuniões futuras agendadas']),
      ultima_nota_nps: parseDecimalBr(o['Última nota NPS']),
      imoveis_quitados_valor: parseMoneyBr(o['Imóveis quitados (valor)']),
      tipos_divida: blankToNull(o['Tipos de dívida']),
      ficha_financeira_atualizada_em: parseDateBr(o['Ficha financeira atualizada em']),
      source_file: sourceFile,
      import_run_id: runId,
    });
    if (o['ID BASE QV (UUID)'] && !parseUuid(o['ID BASE QV (UUID)'])) {
      warnings.push({ table: 'clientes', codigo, field: 'base_qv_id', raw: o['ID BASE QV (UUID)'] });
    }
  }
  return out;
}

function mapSimple(name, mapper) {
  const rows = loadCsv(name);
  const objs = rowsToObjects(rows[0], rows.slice(1));
  return objs.map(mapper).filter(Boolean);
}

function mapSimpleAudited(name, mapper) {
  const rows = loadCsv(name);
  const dataRows = rows.slice(1);
  const objs = rowsToObjects(rows[0], dataRows);
  const valid = objs.map(mapper).filter(Boolean);
  return { rows_read: dataRows.length, valid };
}

/** Regras de dedupe/idempotência (documentação de auditoria — não alterar nesta etapa). */
const DEDUPE_RULE = {
  clientes:
    'ON CONFLICT (codigo_cliente). rows_valid = linhas Base com Id matching ^QV.',
  mecanismos_cliente:
    'ON CONFLICT (id_vinculo). rows_valid = linhas com ID vínculo UUID parseável.',
  pagamentos_programa:
    'dedupe_key = hash(Fonte, ID transação, Data pagamento, Valor (R$), Nome, CPF)',
  nps_respostas:
    'dedupe_key = hash(Código cliente, ID BASE QV, Data da resposta, Onda, Nota, Motivo da nota, Comentário completo)',
  reunioes:
    'dedupe_key = hash(ID BASE QV, Início (horário de Brasília), Nome do evento, Host)',
  transferencias_ep:
    'dedupe_key = hash(ID BASE QV, Data da troca, EP anterior, EP novo, Ordem (1 = mais recente))',
  acordos_reembolso:
    'dedupe_key = hash(Fonte, Nome, CPF, Programa, Valor total do acordo (R$), Data 1º pagamento)',
  reembolsos_omie:
    'dedupe_key = hash(Vencimento, Nome (financeiro), CPF/CNPJ, Valor (R$), Situação)',
  cotas_mecanismos:
    'dedupe_key = hash(Fonte, Documento, Parcela, Data, Valor (R$), Chave)',
  pagantes_fora_base_qv: 'dedupe_key = hash(CPF, Email, Nome)',
  divergencias: 'dedupe_key = hash(Id, Tipo de divergência, Detalhe)',
  premissas: 'dedupe_key = hash(Tema, Premissa)',
  mapa_mecanismos:
    'ON CONFLICT (mecanismo_id). rows_valid = linhas Mapa com mecanismo_id (BASE QV) UUID parseável.',
};

function buildAuditRecord(
  runId,
  entity,
  sourceFile,
  rows_read,
  validRows,
  uniqueRows,
) {
  const rows_valid = validRows.length;
  const rows_unique_written = uniqueRows.length;
  const rows_collapsed_by_dedupe = rows_valid - rows_unique_written;
  let status = 'ok';
  if (rows_collapsed_by_dedupe > 0) status = 'dedupe_collapsed';
  else if (rows_read !== rows_valid) status = 'filtered';
  const notes = [];
  if (rows_read !== rows_valid) {
    notes.push(`${rows_read - rows_valid} linha(s) CSV lidas não viraram registro válido`);
  }
  if (rows_collapsed_by_dedupe > 0) {
    notes.push(`${rows_collapsed_by_dedupe} linha(s) válidas colapsadas pela mesma chave de dedupe`);
  }
  return {
    import_run_id: runId,
    entity,
    source_file: sourceFile,
    rows_read,
    rows_valid,
    rows_unique_written,
    rows_collapsed_by_dedupe,
    dedupe_rule: DEDUPE_RULE[entity],
    status,
    notes: notes.length ? notes.join('; ') : null,
    metric_key: entity,
    expected_count: rows_read,
    actual_count: rows_unique_written,
  };
}

/** Evita “ON CONFLICT DO UPDATE cannot affect row a second time” no mesmo batch. */
function uniqueByKey(rows, key = 'dedupe_key') {
  const map = new Map();
  for (const row of rows) {
    const k = row[key];
    if (k == null) continue;
    map.set(k, row);
  }
  return [...map.values()];
}

async function main() {
  const transport = createTransport();
  const warnings = [];
  const rowCounts = {};
  const filesList = Object.values(FILES);

  const runId = await transport.startRun(filesList);
  const auditRecords = [];

  try {
    const baseCsv = loadCsv(FILES.base);
    const baseRowsRead = Math.max(0, baseCsv.length - 2);
    const clientesValid = loadBaseClientes(FILES.base, runId, warnings);
    const clientes = uniqueByKey(clientesValid, 'codigo_cliente');
    await transport.upsert('clientes', clientes);
    rowCounts.clientes = clientes.length;
    auditRecords.push(
      buildAuditRecord(
        runId,
        'clientes',
        FILES.base,
        baseRowsRead,
        clientesValid,
        clientes,
      ),
    );

    const { rows_read: mecRowsRead, valid: mec } = mapSimpleAudited(FILES.mec, (o) => {
      const id = parseUuid(o['ID vínculo']);
      if (!id) return null;
      return {
        id_vinculo: id,
        base_qv_id: parseUuid(o['ID BASE QV']),
        codigo_cliente: blankToNull(o['Código cliente']),
        nome_cliente: blankToNull(o['Nome cliente']),
        mecanismo_id: parseUuid(o.mecanismo_id),
        mecanismo_nome: blankToNull(o['Mecanismo na BASE0']),
        status: blankToNull(o.Status),
        origem_registro: blankToNull(o['Origem do registro']),
        data_implementacao: parseDateBr(o['Data implementação']),
        data_real: parseBoolPt(o['Data real (não é backfill)']),
        no_plano: parseBoolPt(o['No plano']),
        valor_aplicado: parseMoneyBr(o['Valor aplicado']),
        chave: blankToNull(o.Chave),
        source_file: FILES.mec,
        import_run_id: runId,
      };
    });
    const mecU = uniqueByKey(mec, 'id_vinculo');
    await transport.upsert('mecanismos_cliente', mecU);
    rowCounts.mecanismos_cliente = mecU.length;
    auditRecords.push(
      buildAuditRecord(runId, 'mecanismos_cliente', FILES.mec, mecRowsRead, mec, mecU),
    );

    const { rows_read: pagRowsRead, valid: pagamentos } = mapSimpleAudited(FILES.pagamentos, (o) => {
      const fonte = blankToNull(o.Fonte);
      const idTx = blankToNull(o['ID transação']);
      const data = parseDateBr(o['Data pagamento']);
      const valor = parseMoneyBr(o['Valor (R$)']);
      const dedupe_key = dedupeHash([fonte, idTx, data, valor, o.Nome, o.CPF]);
      return {
        dedupe_key,
        fonte,
        id_transacao: idTx,
        data_pagamento: data,
        nome: blankToNull(o.Nome),
        cpf: blankToNull(o.CPF),
        cpf_norm: digitsOnly(o.CPF),
        email: blankToNull(o.Email),
        produto_herospark: blankToNull(o['Produto (Herospark)']),
        oferta_codigo: blankToNull(o['Oferta / Código']),
        classificacao: blankToNull(o.Classificação),
        conta_como_programa: parseBoolPt(o['Conta como programa']),
        valor,
        valor_pago_comprador: parseMoneyBr(o['Valor pago pelo comprador (R$)']),
        base_qv_id: parseUuid(o['ID BASE QV']),
        match_por: blankToNull(o['Match por']),
        source_file: FILES.pagamentos,
        import_run_id: runId,
      };
    });
    const pagU = uniqueByKey(pagamentos);
    if (pagU.length !== pagamentos.length) {
      warnings.push({
        table: 'pagamentos_programa',
        field: 'dedupe_key',
        raw: `${pagamentos.length - pagU.length} linhas CSV colapsadas (mesma chave natural)`,
      });
    }
    await transport.upsert('pagamentos_programa', pagU);
    rowCounts.pagamentos_programa = pagU.length;
    auditRecords.push(
      buildAuditRecord(runId, 'pagamentos_programa', FILES.pagamentos, pagRowsRead, pagamentos, pagU),
    );

    const { rows_read: npsRowsRead, valid: nps } = mapSimpleAudited(FILES.nps, (o) => {
      const data = parseDateBr(o['Data da resposta']);
      const nota = parseIntSafe(o.Nota);
      const dedupe_key = dedupeHash([
        o['Código cliente'],
        o['ID BASE QV'],
        data,
        o.Onda,
        nota,
        o['Motivo da nota'],
        o['Comentário completo'],
      ]);
      return {
        dedupe_key,
        codigo_cliente: blankToNull(o['Código cliente']),
        nome_cliente: blankToNull(o['Nome cliente (BASE QV)']),
        base_qv_id: parseUuid(o['ID BASE QV']),
        programa: blankToNull(o.Programa),
        data_resposta: data,
        nota,
        categoria: blankToNull(o.Categoria),
        ultima_resposta_cliente: parseBoolPt(o['Última resposta do cliente']),
        motivo_nota: blankToNull(o['Motivo da nota']),
        comentario_completo: blankToNull(o['Comentário completo']),
        onda: blankToNull(o.Onda),
        ultima_resposta_cliente_onda: parseBoolPt(o['Última resposta do cliente na onda']),
        vinculo_cliente: blankToNull(o['Vínculo com o cliente']),
        source_file: FILES.nps,
        import_run_id: runId,
      };
    });
    const npsU = uniqueByKey(nps);
    await transport.upsert('nps_respostas', npsU);
    rowCounts.nps_respostas = npsU.length;
    auditRecords.push(
      buildAuditRecord(runId, 'nps_respostas', FILES.nps, npsRowsRead, nps, npsU),
    );

    const { rows_read: reunRowsRead, valid: reunioes } = mapSimpleAudited(FILES.reunioes, (o) => {
      const inicio = parseDateTimeBr(o['Início (horário de Brasília)']);
      const dedupe_key = dedupeHash([
        o['ID BASE QV'],
        inicio,
        o['Nome do evento'],
        o.Host,
      ]);
      return {
        dedupe_key,
        codigo_cliente: blankToNull(o['Código cliente']),
        nome_cliente: blankToNull(o['Nome cliente (BASE QV)']),
        base_qv_id: parseUuid(o['ID BASE QV']),
        tipo_reuniao: blankToNull(o['Tipo de reunião']),
        nome_evento: blankToNull(o['Nome do evento']),
        inicio_brasilia: inicio,
        host: blankToNull(o.Host),
        email_convidado: blankToNull(o['Email do convidado']),
        vinculada_manualmente: parseBoolPt(o['Vinculada manualmente']),
        registros_origem: parseIntSafe(o['Registros na origem']),
        source_file: FILES.reunioes,
        import_run_id: runId,
      };
    });
    const reunU = uniqueByKey(reunioes);
    await transport.upsert('reunioes', reunU);
    rowCounts.reunioes = reunU.length;
    auditRecords.push(
      buildAuditRecord(runId, 'reunioes', FILES.reunioes, reunRowsRead, reunioes, reunU),
    );

    const { rows_read: transRowsRead, valid: trans } = mapSimpleAudited(FILES.transferencias, (o) => {
      const data = parseDateBr(o['Data da troca']);
      const dedupe_key = dedupeHash([
        o['ID BASE QV'],
        data,
        o['EP anterior'],
        o['EP novo'],
        o['Ordem (1 = mais recente)'],
      ]);
      return {
        dedupe_key,
        codigo_cliente: blankToNull(o['Código cliente']),
        nome_cliente: blankToNull(o['Nome cliente (BASE QV)']),
        base_qv_id: parseUuid(o['ID BASE QV']),
        ep_anterior: blankToNull(o['EP anterior']),
        ep_novo: blankToNull(o['EP novo']),
        data_troca: data,
        alterado_por_id: parseUuid(o['Alterado por (ID)']),
        observacao_log: blankToNull(o['Observação do log']),
        ordem: parseIntSafe(o['Ordem (1 = mais recente)']),
        source_file: FILES.transferencias,
        import_run_id: runId,
      };
    });
    const transU = uniqueByKey(trans);
    await transport.upsert('transferencias_ep', transU);
    rowCounts.transferencias_ep = transU.length;
    auditRecords.push(
      buildAuditRecord(runId, 'transferencias_ep', FILES.transferencias, transRowsRead, trans, transU),
    );

    const { rows_read: acordosRowsRead, valid: acordos } = mapSimpleAudited(FILES.acordos, (o) => {
      const dedupe_key = dedupeHash([
        o.Fonte,
        o.Nome,
        o.CPF,
        o.Programa,
        o['Valor total do acordo (R$)'],
        o['Data 1º pagamento'],
      ]);
      return {
        dedupe_key,
        fonte: blankToNull(o.Fonte),
        mes_legado: blankToNull(o['Mês (Legado)']),
        nome: blankToNull(o.Nome),
        cpf: blankToNull(o.CPF),
        cpf_norm: digitsOnly(o.CPF),
        programa: blankToNull(o.Programa),
        status: blankToNull(o.Status),
        valor_total_acordo: parseMoneyBr(o['Valor total do acordo (R$)']),
        qtd_parcelas: parseIntSafe(o['Qtd parcelas']),
        data_primeiro_pagamento: parseDateBr(o['Data 1º pagamento']),
        base_qv_id: parseUuid(o['ID BASE QV']),
        match_por: blankToNull(o['Match por']),
        source_file: FILES.acordos,
        import_run_id: runId,
      };
    });
    const acordosU = uniqueByKey(acordos);
    await transport.upsert('acordos_reembolso', acordosU);
    rowCounts.acordos_reembolso = acordosU.length;
    auditRecords.push(
      buildAuditRecord(runId, 'acordos_reembolso', FILES.acordos, acordosRowsRead, acordos, acordosU),
    );

    const { rows_read: reembRowsRead, valid: reembolsos } = mapSimpleAudited(FILES.reembolsos, (o) => {
      const dedupe_key = dedupeHash([
        o.Vencimento,
        o['Nome (financeiro)'],
        o['CPF/CNPJ'],
        o['Valor (R$)'],
        o.Situação,
      ]);
      return {
        dedupe_key,
        vencimento: parseDateBr(o.Vencimento),
        previsao_pagamento: parseDateBr(o['Previsão de pagamento']),
        nome_financeiro: blankToNull(o['Nome (financeiro)']),
        cpf_cnpj: blankToNull(o['CPF/CNPJ']),
        cpf_cnpj_norm: digitsOnly(o['CPF/CNPJ']),
        categoria_financeira: blankToNull(o['Categoria financeira']),
        classe: blankToNull(o.Classe),
        situacao: blankToNull(o.Situação),
        grupo: blankToNull(o.Grupo),
        valor: parseMoneyBr(o['Valor (R$)']),
        base_qv_id: parseUuid(o['ID BASE QV']),
        match_por: blankToNull(o['Match por']),
        source_file: FILES.reembolsos,
        import_run_id: runId,
      };
    });
    const reembU = uniqueByKey(reembolsos);
    if (reembU.length !== reembolsos.length) {
      warnings.push({
        table: 'reembolsos_omie',
        field: 'dedupe_key',
        raw: `${reembolsos.length - reembU.length} linhas CSV colapsadas (mesma chave natural)`,
      });
    }
    await transport.upsert('reembolsos_omie', reembU);
    rowCounts.reembolsos_omie = reembU.length;
    auditRecords.push(
      buildAuditRecord(runId, 'reembolsos_omie', FILES.reembolsos, reembRowsRead, reembolsos, reembU),
    );

    const { rows_read: cotasRowsRead, valid: cotas } = mapSimpleAudited(FILES.cotas, (o) => {
      const dedupe_key = dedupeHash([
        o.Fonte,
        o.Documento,
        o.Parcela,
        o.Data,
        o['Valor (R$)'],
        o.Chave,
      ]);
      return {
        dedupe_key,
        fonte: blankToNull(o.Fonte),
        documento: blankToNull(o.Documento),
        parcela: blankToNull(o.Parcela),
        data: parseDateBr(o.Data),
        nome_financeiro: blankToNull(o['Nome (financeiro)']),
        cpf_cnpj: blankToNull(o['CPF/CNPJ']),
        cpf_cnpj_norm: digitsOnly(o['CPF/CNPJ']),
        categoria_financeira: blankToNull(o['Categoria financeira']),
        projeto_codigo: blankToNull(o['Projeto / Código']),
        situacao: blankToNull(o.Situação),
        grupo: blankToNull(o.Grupo),
        valor: parseMoneyBr(o['Valor (R$)']),
        base_qv_id: parseUuid(o['ID BASE QV']),
        match_por: blankToNull(o['Match por']),
        mecanismo_nome: blankToNull(o['Mecanismo na BASE0']),
        chave: blankToNull(o.Chave),
        source_file: FILES.cotas,
        import_run_id: runId,
      };
    });
    const cotasU = uniqueByKey(cotas);
    if (cotasU.length !== cotas.length) {
      warnings.push({
        table: 'cotas_mecanismos',
        field: 'dedupe_key',
        raw: `${cotas.length - cotasU.length} linhas CSV colapsadas (mesma chave natural)`,
      });
    }
    await transport.upsert('cotas_mecanismos', cotasU);
    rowCounts.cotas_mecanismos = cotasU.length;
    auditRecords.push(
      buildAuditRecord(runId, 'cotas_mecanismos', FILES.cotas, cotasRowsRead, cotas, cotasU),
    );

    const { rows_read: pagantesRowsRead, valid: pagantes } = mapSimpleAudited(FILES.pagantes, (o) => {
      const dedupe_key = dedupeHash([o.CPF, o.Email, o.Nome]);
      return {
        dedupe_key,
        nome: blankToNull(o.Nome),
        cpf: blankToNull(o.CPF),
        cpf_norm: digitsOnly(o.CPF),
        email: blankToNull(o.Email),
        fontes: blankToNull(o.Fontes),
        primeiro_pagamento: parseDateBr(o['Primeiro pagamento']),
        ultimo_pagamento: parseDateBr(o['Último pagamento']),
        qtd_pagamentos: parseIntSafe(o['Qtd pagamentos']),
        total_pago: parseMoneyBr(o['Total pago (R$)']),
        source_file: FILES.pagantes,
        import_run_id: runId,
      };
    });
    const pagantesU = uniqueByKey(pagantes);
    await transport.upsert('pagantes_fora_base_qv', pagantesU);
    rowCounts.pagantes_fora_base_qv = pagantesU.length;
    auditRecords.push(
      buildAuditRecord(
        runId,
        'pagantes_fora_base_qv',
        FILES.pagantes,
        pagantesRowsRead,
        pagantes,
        pagantesU,
      ),
    );

    const { rows_read: divRowsRead, valid: divs } = mapSimpleAudited(FILES.divergencias, (o) => {
      const dedupe_key = dedupeHash([o.Id, o['Tipo de divergência'], o.Detalhe]);
      return {
        dedupe_key,
        codigo_cliente: blankToNull(o.Id),
        nome: blankToNull(o.Nome),
        status_base_qv: blankToNull(o['Status BASE QV']),
        tipo_divergencia: blankToNull(o['Tipo de divergência']),
        detalhe: blankToNull(o.Detalhe),
        source_file: FILES.divergencias,
        import_run_id: runId,
      };
    });
    const divsU = uniqueByKey(divs);
    await transport.upsert('divergencias', divsU);
    rowCounts.divergencias = divsU.length;
    auditRecords.push(
      buildAuditRecord(runId, 'divergencias', FILES.divergencias, divRowsRead, divs, divsU),
    );

    const { rows_read: premRowsRead, valid: prem } = mapSimpleAudited(FILES.premissas, (o) => {
      const dedupe_key = dedupeHash([o.Tema, o.Premissa]);
      return {
        dedupe_key,
        tema: blankToNull(o.Tema),
        premissa: blankToNull(o.Premissa),
        source_file: FILES.premissas,
        import_run_id: runId,
      };
    });
    const premU = uniqueByKey(prem);
    await transport.upsert('premissas', premU);
    rowCounts.premissas = premU.length;
    auditRecords.push(
      buildAuditRecord(runId, 'premissas', FILES.premissas, premRowsRead, prem, premU),
    );

    const mapaRows = loadCsv(FILES.mapa);
    const mapaBody = mapaRows.slice(4);
    const mapa = [];
    for (const cells of mapaBody) {
      const o = {
        'mecanismo_id (BASE QV)': cells[0],
        Código: cells[1],
        'Nome no BASE QV': cells[2],
        'Coluna na BASE0': cells[3],
        'Status no cadastro': cells[4],
        Vínculos: cells[5],
        Concluídos: cells[6],
        Aptos: cells[7],
        'Colunas de mecanismo da BASE0': cells[9],
      };
      const mecId = parseUuid(o['mecanismo_id (BASE QV)']);
      if (!mecId) continue;
      mapa.push({
        mecanismo_id: mecId,
        codigo: blankToNull(o.Código),
        nome_base_qv: blankToNull(o['Nome no BASE QV']),
        coluna_base0: blankToNull(o['Coluna na BASE0']),
        status_cadastro: blankToNull(o['Status no cadastro']),
        vinculos: parseIntSafe(o.Vínculos),
        concluidos: parseIntSafe(o.Concluídos),
        aptos: parseIntSafe(o.Aptos),
        coluna_mecanismo_base0: blankToNull(o['Colunas de mecanismo da BASE0']),
        ativo: (o['Status no cadastro'] ?? '').toLowerCase() !== 'inativo',
        source_file: FILES.mapa,
        import_run_id: runId,
      });
    }
    const mapaU = uniqueByKey(mapa, 'mecanismo_id');
    await transport.upsert('mapa_mecanismos', mapaU);
    rowCounts.mapa_mecanismos = mapaU.length;
    auditRecords.push(
      buildAuditRecord(runId, 'mapa_mecanismos', FILES.mapa, mapaBody.length, mapa, mapaU),
    );

    await transport.insertValidations(auditRecords);

    await transport.finishRun(runId, {
      status: 'completed',
      rowCounts,
      warnings: warnings.slice(0, 500),
    });

    const sanity = await transport.sanity();
    const auditTable = auditRecords.map((r) => ({
      entidade: r.entity,
      csv_lidas: r.rows_read,
      validas: r.rows_valid,
      unicas_gravadas: r.rows_unique_written,
      colapsadas_dedupe: r.rows_collapsed_by_dedupe,
      regra_dedupe: r.dedupe_rule,
      status: r.status,
    }));
    console.log(
      JSON.stringify(
        {
          mode: transport.mode,
          runId,
          import_status: 'completed',
          rowCounts,
          warnings: warnings.length,
          audit: auditTable,
          sanity,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    await transport.finishRun(runId, {
      status: 'failed',
      rowCounts,
      warnings: [],
      errors: [{ message: String(e.message ?? e) }],
    });
    throw e;
  } finally {
    await transport.close();
  }
}

async function sanityReportPg(pg) {
  const tables = [
    ['clientes', 'base_qv_id'],
    ['pagamentos_programa', 'base_qv_id'],
    ['nps_respostas', 'base_qv_id'],
    ['reembolsos_omie', 'base_qv_id'],
    ['reunioes', 'base_qv_id'],
  ];
  const out = {};
  for (const [t, col] of tables) {
    const [{ total }] = await pg.unsafe(
      `select count(*)::int as total from base0.${t}`,
    );
    const [{ with_match }] = await pg.unsafe(
      `select count(*)::int as with_match from base0.${t} where ${col} is not null`,
    );
    out[t] = {
      total,
      with_match,
      without_match: total - with_match,
    };
  }
  const mecStatus = await pg`
    select status, count(*)::int as n
    from base0.mecanismos_cliente
    group by status
    order by n desc
  `;
  const divTipo = await pg`
    select tipo_divergencia, count(*)::int as n
    from base0.divergencias
    group by tipo_divergencia
    order by n desc
  `;
  const pagMatch = await pg`
    select
      count(*) filter (where match_por is not null and match_por <> 'Sem match')::int as com_match,
      count(*) filter (where match_por is null or match_por = 'Sem match')::int as sem_match
    from base0.pagamentos_programa
  `;
  out.mecanismos_por_status = mecStatus;
  out.divergencias_por_tipo = divTipo;
  out.pagamentos_match = pagMatch[0];
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
