/**
 * Importa NPS PHARUS consolidado → Business Data schema nps_historico (rckp…).
 * Fontes: NPS_PHARUS_consolidado.csv + abas do xlsx todas_medicoes.
 *
 * Uso (a partir de analytics-nps/):
 *   node scripts/import-nps-historico-pharus.mjs
 *
 * Requer .env: ANALYTICS_NPS_SUPABASE_URL, ANALYTICS_NPS_SUPABASE_SERVICE_ROLE_KEY
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..');

function loadEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) throw new Error('Missing analytics-nps/.env');
  const text = readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

function asText(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' || s.toLowerCase() === 'nan' ? null : s;
}

function asNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asInt(v) {
  const n = asNum(v);
  return n === null ? null : Math.trunc(n);
}

function parseTs(v) {
  const s = asText(v);
  if (!s) return null;
  const d = new Date(s.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function chaveResposta(row) {
  const id = asText(row.id_resposta);
  if (id) return id;
  const payload = [
    asText(row.ciclo),
    asText(row.data_resposta),
    asText(row.cliente),
    asText(row.nota_nps),
    asText(row.fonte_arquivo),
    asText(row.fonte_aba),
  ].join('|');
  return `hash:${createHash('sha256').update(payload, 'utf8').digest('hex')}`;
}

function parseCsvRespostas(csvPath) {
  const wb = XLSX.readFile(csvPath, { type: 'file' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  return rows.map((r) => ({
    chave_import: chaveResposta(r),
    ciclo: asText(r.ciclo),
    ciclo_nome: asText(r.ciclo_nome),
    data_resposta: parseTs(r.data_resposta),
    cliente: asText(r.cliente),
    id_cliente: asText(r.id_cliente),
    programa: asText(r.programa),
    ep: asText(r.ep),
    nota_nps: asNum(r.nota_nps),
    categoria: asText(r.categoria),
    nota_estrategista: asNum(r.nota_estrategista),
    nota_backoffice: asNum(r.nota_backoffice),
    nota_qv360: asNum(r.nota_qv360),
    nota_arquitetura_patrimonial: asNum(r.nota_arquitetura_patrimonial),
    plano_patrimonial: asText(r.plano_patrimonial),
    plano_apresentado: asText(r.plano_apresentado),
    caminho: asText(r.caminho),
    momento: asText(r.momento),
    motivo_nota: asText(r.motivo_nota),
    melhoria: asText(r.melhoria),
    razao_positiva: asText(r.razao_positiva),
    retencao_5_anos: asText(r.retencao_5_anos),
    comentario_adicional: asText(r.comentario_adicional),
    reunioes_realizadas: asText(r.reunioes_realizadas),
    inicio_programa: asText(r.inicio_programa),
    versao_formulario: asText(r.versao_formulario),
    fonte_arquivo: asText(r.fonte_arquivo),
    fonte_aba: asText(r.fonte_aba),
    id_resposta: asText(r.id_resposta),
    ref_programa: asText(r.ref_programa),
    ref_ep: asText(r.ref_ep),
  }));
}

const CICLOS_MEDICAO = new Set(['2025-Q2', '2025-Q3', '2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3']);

function sheetByPrefix(wb, prefix) {
  const name = wb.SheetNames.find((n) => n.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!name) throw new Error(`Sheet not found: ${prefix}`);
  return name;
}

function parseMedicoes(wb) {
  const sheet = sheetByPrefix(wb, 'Resumo');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: null });
  const out = [];
  for (const row of rows) {
    const ciclo = asText(row[0]);
    if (!ciclo || !CICLOS_MEDICAO.has(ciclo)) continue;
    out.push({
      ciclo,
      medicao: asText(row[1]),
      janela_datas: asText(row[2]),
      respostas: asInt(row[3]),
      promotores: asInt(row[4]),
      neutros: asInt(row[5]),
      detratores: asInt(row[6]),
      pct_promotores: asNum(row[7]),
      pct_detratores: asNum(row[8]),
      nps: asNum(row[9]),
      nota_media: asNum(row[10]),
      painel_oficial_respostas: asInt(row[11]),
      painel_oficial_nps: asNum(row[12]),
    });
  }
  return out;
}

function parseArquivos(wb) {
  const sheet = sheetByPrefix(wb, 'Arquivos');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: null });
  return rows.map((r) => ({
    arquivo_recebido: asText(r['Arquivo recebido']),
    tipo: asText(r.Tipo),
    conteudo: asText(r.Conteúdo ?? r.Conteudo),
    periodo: asText(r['Período'] ?? r.Periodo),
    linhas: asNum(r.Linhas),
    como_foi_usado: asText(r['Como foi usado']),
    respostas_consolidado: asInt(r['Respostas que entraram no consolidado']),
    linhas_excluidas_consolidacao: asInt(r['Linhas excluídas na consolidação'] ?? r['Linhas excluidas na consolidacao']),
    observacao: asText(r['Observação'] ?? r.Observacao),
  }));
}

function parseExcluidos(wb) {
  const sheet = sheetByPrefix(wb, 'Exclu');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: null });
  return rows.map((r) => ({
    motivo_exclusao: asText(r.motivo_exclusao),
    data_resposta: parseTs(r.data_resposta),
    cliente: asText(r.cliente),
    nota_nps: asNum(r.nota_nps),
    fonte_arquivo: asText(r.fonte_arquivo),
    fonte_aba: asText(r.fonte_aba),
    id_resposta: asText(r.id_resposta),
    ref_programa: asText(r.ref_programa),
  }));
}

function parseMotivos(wb) {
  const sheet = sheetByPrefix(wb, 'Motivos');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: null });
  return rows.map((r) => ({
    motivo: asText(r.Motivo),
    linhas: asInt(r.Linhas),
  }));
}

async function upsertBatches(supabase, table, rows, onConflict, batchSize = 100) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await supabase.schema('nps_historico').from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} batch ${i}: ${error.message}`);
  }
}

async function replaceAll(supabase, table) {
  const { error } = await supabase.schema('nps_historico').from(table).delete().not('id', 'is', null);
  if (error) throw new Error(`delete ${table}: ${error.message}`);
}

async function main() {
  const env = loadEnv();
  const url = env.ANALYTICS_NPS_SUPABASE_URL;
  const key = env.ANALYTICS_NPS_SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.includes('rckpuebaiswrxzmywllv') || !key) {
    throw new Error('Business Data Supabase env missing or wrong project');
  }

  const csvPath = join(repoRoot, 'NPS_PHARUS_consolidado.csv');
  const xlsxPath = join(repoRoot, 'NPS_PHARUS_consolidado_todas_medicoes.xlsx');
  if (!existsSync(csvPath) || !existsSync(xlsxPath)) {
    throw new Error('Source files not found in repo root');
  }

  const respostas = parseCsvRespostas(csvPath);
  const wb = XLSX.readFile(xlsxPath);
  const medicoes = parseMedicoes(wb);
  const arquivos = parseArquivos(wb);
  const excluidos = parseExcluidos(wb);
  const motivos = parseMotivos(wb);

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  await replaceAll(supabase, 'excluidos');
  await replaceAll(supabase, 'arquivos_recebidos');

  await upsertBatches(supabase, 'respostas', respostas, 'chave_import');
  await upsertBatches(supabase, 'medicoes', medicoes, 'ciclo');
  await upsertBatches(supabase, 'motivos_exclusao', motivos, 'motivo');
  await upsertBatches(supabase, 'arquivos_recebidos', arquivos, 'arquivo_recebido,periodo,tipo');
  if (excluidos.length) {
    const { error } = await supabase.schema('nps_historico').from('excluidos').insert(excluidos);
    if (error) throw new Error(`excluidos insert: ${error.message}`);
  }

  console.log(
    JSON.stringify(
      {
        respostas: respostas.length,
        medicoes: medicoes.length,
        arquivos_recebidos: arquivos.length,
        excluidos: excluidos.length,
        motivos_exclusao: motivos.length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
