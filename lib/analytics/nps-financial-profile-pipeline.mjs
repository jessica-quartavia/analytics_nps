import { readJson } from '../data/file-store.mjs';
import {
  buildNpsFinancialProfileDoc,
  buildFinancialProfileQa,
  SET_CYCLE_CODE,
} from './nps-financial-profile.mjs';
import { loadFinancialProvenance, countSourcesForClientIds } from './financial-provenance.mjs';

export async function loadFinancialByClient(opts = {}) {
  const prov = await loadFinancialProvenance(opts);
  const rows = [...prov.financialByClient.values()];
  const sourceLabel =
    prov.meta.raw_row_count > 0
      ? prov.meta.fallback_row_count > prov.meta.raw_row_count
        ? 'raw+fallback'
        : 'raw_snapshot'
      : prov.meta.fallback_row_count
        ? 'fallback_export'
        : 'none';
  return {
    financialByClient: prov.financialByClient,
    financialRows: rows,
    financialSource: sourceLabel,
    snapshotId: prov.snapshotId,
    provenance: prov,
  };
}

export async function buildNpsFinancialProfileArtifacts(opts = {}) {
  const responses = opts.responses ?? (await readJson('processed/responses.json', []));
  const responseTopics = opts.responseTopics ?? (await readJson('processed/response_topics.json', []));
  const milestonesDoc =
    opts.clientMilestonesDoc ?? (await readJson('processed/nps_client_milestones.json', null));
  const milestoneEntries = milestonesDoc?.entries ?? [];

  const { financialByClient, financialRows, financialSource, provenance } = await loadFinancialByClient(opts);
  const cycleCode = opts.cycleCode ?? SET_CYCLE_CODE;

  const profileDoc = buildNpsFinancialProfileDoc({
    responses,
    responseTopics,
    milestoneEntries,
    financialByClient,
    sourceForClient: provenance.sourceForClient,
    cycleCode,
    financialSource,
    dataCutoff: opts.dataCutoff,
  });

  const publicEntries = profileDoc.entries.map(({ _raw_income, _raw_contribution, _raw_reserve, ...rest }) => rest);
  profileDoc.entries = publicEntries;

  const setClientIds = profileDoc.entries.map((e) => e.client_id);
  const sourceCounts = countSourcesForClientIds(setClientIds, provenance.sourceForClient);

  const audit = await readJson('quality/nps_financial_sources_audit.json', null);
  const mcpCov = audit?.baseQvRevalidation?.client_financial_data?.coverage_set_respondents;

  const coverageReconciliation = {
    mcp_audit: mcpCov
      ? {
          with_row: mcpCov.with_row,
          total_clients: mcpCov.total_clients,
          pct: mcpCov.pct,
          audited_at: audit?.baseQvRevalidation?.audited_at,
        }
      : { with_row: 243, total_clients: 253, pct: (243 / 253) * 100, note: 'default from etapa 4.6' },
    pipeline_set: {
      financial_rows: profileDoc.financial_profile_coverage.financial_rows,
      respondents_total: profileDoc.financial_profile_coverage.respondents_total,
      pct: profileDoc.financial_profile_coverage.coverage_among_available_financial_set_pct,
      financial_source_counts: sourceCounts,
    },
    nominal_explanation:
      'A auditoria MCP (join live) contabilizou 243/253 respondentes com linha em client_financial_data no momento do cruzamento. O pipeline 4.7 usa o export dedicado Set (quality/set_financial_export.json) até o snapshot raw incluir client_financial_data.json — por isso 253/253 no conjunto disponível local, sem alterar valores BASE QV. A diferença nominal (~10 clientes) reflete export batch vs. cruzamento pontual MCP, não recomputação de Tier.',
    language_rule:
      'Enquanto raw_snapshot não cobrir todos os respondentes, reportar "100% no conjunto financeiro disponível para esta análise", não "100% BASE QV snapshot".',
  };

  const qaDoc = buildFinancialProfileQa(publicEntries, financialRows, profileDoc.financial_profile_coverage, {
    cycleCode,
    financialSource,
    coverageReconciliation,
  });

  return { profileDoc, qaDoc };
}
