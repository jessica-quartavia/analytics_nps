import {
  getPreviousCycleCode,
  getResponsesForCycle,
  buildFilterOptionsForCycle,
  filterCycleResponses,
  summaryLikeFromResponses,
  isClientRecorteActive,
  buildFilteredMigrationMatrix,
  pairedNpsFromMovementRows,
  shouldUseFilteredMigrationMatrix,
  getMigrationMatrixForCurrent,
} from '../data/store-core.mjs';

/** Contexto único de filtros globais para todas as páginas. */
export function buildGlobalFilterContext(deps) {
  const {
    cycleCode,
    filters,
    responses,
    cycles,
    pairedDoc,
    migrationDoc,
    actionQueue,
    clientSatMap,
    officialSummary,
    previousOfficialSummary,
  } = deps;

  if (!cycleCode || !filters) return null;

  const options = buildFilterOptionsForCycle({
    pairedDoc,
    actionQueue,
    clientSatMap,
    cycleCode,
    filters,
  });

  const matrixFilters = { ...filters, migrationCell: '' };
  const rowsCurrent = filterCycleResponses(responses, cycleCode, matrixFilters, options);
  const rowsMovement = filterCycleResponses(
    responses,
    cycleCode,
    { ...filters, withPreviousOnly: true },
    options,
  );

  const recorteActive = isClientRecorteActive(filters);
  const prevCode = getPreviousCycleCode(cycles ?? [], cycleCode);

  let displaySummary = officialSummary;
  let displayPrevious = previousOfficialSummary;

  if (recorteActive && officialSummary) {
    displaySummary = summaryLikeFromResponses(rowsCurrent, officialSummary);
    if (prevCode && previousOfficialSummary) {
      const clientIds = new Set(rowsCurrent.map((r) => r.client_id).filter(Boolean));
      const prevRows = getResponsesForCycle(responses, prevCode).filter((r) => clientIds.has(r.client_id));
      displayPrevious = summaryLikeFromResponses(prevRows, previousOfficialSummary);
    }
  }

  let migrationMatrix = getMigrationMatrixForCurrent(migrationDoc, cycleCode);
  if (prevCode && shouldUseFilteredMigrationMatrix(filters)) {
    migrationMatrix = buildFilteredMigrationMatrix(prevCode, cycleCode, responses, rowsCurrent);
  }

  const pairedOfficial = deps.pairedDoc?.current_cycle === cycleCode ? deps.pairedDoc : null;
  let pairedDisplay = pairedOfficial;
  if (recorteActive) {
    pairedDisplay = pairedNpsFromMovementRows(rowsMovement);
  } else if (filters.base === 'paired' && pairedOfficial) {
    pairedDisplay = pairedOfficial;
  }

  return {
    cycleCode,
    filters: { ...filters },
    options,
    rowsCurrent,
    rowsMovement,
    displaySummary,
    displayPrevious,
    officialSummary,
    previousOfficialSummary,
    recorteActive,
    migrationMatrix,
    pairedDisplay,
    prevCycleCode: prevCode,
  };
}

export function renderFilterRecorteBanner(ctx) {
  if (!ctx?.recorteActive) return '';
  return `<div class="filter-recorte-banner" role="status">
    <strong>Recorte ativo.</strong>
    KPIs, composição e distribuição refletem os filtros selecionados.
    Histórico multi-ciclo, IC95, clientes com envio e diagnóstico executivo permanecem do ciclo oficial.
  </div>`;
}

/** Remove filtros VoC/temáticos do contexto de população em Jornada & Perfil. */
export function filtersForJornadaPopulationView(filters) {
  if (!filters) return filters;
  return {
    ...filters,
    topic: '',
    valence: '',
    search: '',
    vocMatrixTopic: '',
    vocMatrixValence: '',
  };
}

export function categoryDenomsFromContext(filterCtx) {
  const s = filterCtx?.recorteActive ? filterCtx.displaySummary : filterCtx?.officialSummary;
  if (!s) return null;
  return {
    Promotor: s.promoters ?? 0,
    Neutro: s.neutrals ?? s.passives ?? 0,
    Detrator: s.detractors ?? 0,
  };
}
