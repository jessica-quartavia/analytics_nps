#!/usr/bin/env node
import { readJson, writeJson } from '../lib/data/file-store.mjs';
import { createBaseQvClient, fetchPharusClientProfiles, fetchClientMecanismosLinks, fetchMecanismosCatalog } from '../lib/data/base-qv.mjs';
import { buildPromotoresFiveEstrelasPack, PROMOTOR_5_ESTRELAS_RULE } from '../lib/analytics/promotores-5-estrelas.mjs';
import { buildProfessionCategoriesAudit } from '../lib/analytics/profession-category.mjs';

const responses = await readJson('processed/responses.json', []);

let clients = [];
let clientMecanismos = [];
let mecanismosCatalog = [];
let dataSource = 'base_qv_live';

try {
  const baseQv = createBaseQvClient();
  clients = await fetchPharusClientProfiles(baseQv);
  clientMecanismos = await fetchClientMecanismosLinks(baseQv);
  mecanismosCatalog = await fetchMecanismosCatalog(baseQv);
} catch (err) {
  console.warn('Promotores 5 Estrelas: fallback ingest parcial —', err.message);
  dataSource = 'ingest_partial_fallback';
  clients = await readJson('ingest/partials/clients.json', []);
}

const pack = buildPromotoresFiveEstrelasPack({
  clients,
  responses,
  clientMecanismos,
  mecanismosCatalog,
});

pack.meta.data_source = dataSource;

await writeJson('processed/promotores_5_estrelas.json', pack);
await writeJson('quality/promotores_5_estrelas_profession_categories.json', {
  generated_at: pack.meta.generated_at,
  entries: buildProfessionCategoriesAudit(pack.clients),
});
await writeJson('quality/promotores_5_estrelas_audit.json', {
  generated_at: pack.meta.generated_at,
  data_source: dataSource,
  rule: PROMOTOR_5_ESTRELAS_RULE,
  ...pack.universe_audit,
  profile: pack.profile,
  mechanisms: pack.mechanisms,
  eligible_rows_materialized: pack.clients.length,
});

console.log(
  `Promotores 5 Estrelas: elegíveis=${pack.universe_audit.eligible_total} (ativos ${pack.universe_audit.eligible_active}) · fonte=${dataSource}`,
);
