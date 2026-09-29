import { escapeHtml, escapeAttr } from '../utils/escape-html.js';

/** Microtexto de seção — linguagem simples */
export function sectionLead(text) {
  if (!text) return '';
  return `<p class="section-lead">${escapeHtml(text)}</p>`;
}

export function sectionHead(title, subtitle, lead) {
  return `
    <div class="section-head">
      <h2 class="section-title">${escapeHtml(title)}</h2>
      ${subtitle ? `<p class="section-subtitle">${escapeHtml(subtitle)}</p>` : ''}
      ${lead ? sectionLead(lead) : ''}
    </div>`;
}

/**
 * Tooltip didático (hover + foco).
 * @param {string} label — texto visível (pode ser vazio se só ícone)
 * @param {string} tip
 */
export function helpTip(label, tip) {
  if (!tip) return escapeHtml(label ?? '');
  const safeTip = escapeAttr(tip);
  return `<span class="help-tip">
    ${label ? `<span class="help-tip__label">${escapeHtml(label)}</span>` : ''}
    <button type="button" class="help-tip__btn" aria-label="${safeTip}" data-tip="${safeTip}">?</button>
  </span>`;
}

/** Rótulo de KPI com tooltip */
export function kpiLabelWithTip(label, tip) {
  return helpTip(label, tip);
}

export const TIPS = {
  npsAtual: 'É o resultado do NPS no ciclo selecionado.',
  npsAnterior: 'É o resultado do ciclo anterior usado para comparação.',
  variacao: 'Mostra quantos pontos o NPS subiu ou caiu em relação ao ciclo anterior.',
  basePareada: 'Clientes que responderam nos dois ciclos comparados.',
  promotores: 'Clientes que deram nota 9 ou 10.',
  neutros: 'Clientes que deram nota 7 ou 8.',
  detratores: 'Clientes que deram nota de 0 a 6.',
  ic95: 'Faixa de incerteza estatística do NPS estimado.',
  drivers: 'Fatores associados à nota ou à categoria NPS. Associação não significa causa.',
  valencia: 'Indica se o comentário sobre um tema foi positivo, neutro ou negativo.',
  prioridadeAlta: 'Clientes que exigem atenção mais imediata.',
  investigar: 'Clientes com sinais que merecem olhar mais cuidadoso.',
};
