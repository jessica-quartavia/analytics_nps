import { escapeHtml } from '../utils/escape-html.js';

/**
 * Paginação Histórico 2 (EP, Cliente Explorer).
 */
export function renderHistorico2Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  prevId,
  nextId,
  unitLabel,
}) {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = totalItems === 0 ? 0 : Math.min(safePage * pageSize, totalItems);
  const rangeText =
    totalItems === 0
      ? `Nenhum ${unitLabel}`
      : `Mostrando ${start}–${end} de ${totalItems} ${unitLabel}`;

  return `<nav class="historico2-pagination" aria-label="Paginação">
    <div class="historico2-pagination__range">${escapeHtml(rangeText)}</div>
    <div class="historico2-pagination__controls">
      <button type="button" class="historico2-page-btn" id="${escapeHtml(prevId)}" ${safePage <= 1 ? 'disabled' : ''}>← Anterior</button>
      <span class="historico2-pagination__status">Página ${safePage} de ${safeTotalPages}</span>
      <button type="button" class="historico2-page-btn historico2-page-btn--primary" id="${escapeHtml(nextId)}" ${safePage >= safeTotalPages ? 'disabled' : ''}>Próxima →</button>
    </div>
  </nav>`;
}
