import { formatDate } from '../utils/format.js';
import { cell, finalPriorityLabel, resolveRowProgram } from './action-display-helpers.mjs';
import { getLastModification } from './action-audit-helpers.mjs';

function esc(s) {
  return String(cell(s, '—'))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function vocSource(t) {
  if (t.classifier_source === 'human_review' || t.reviewed) return 'Revisão humana';
  if (t.classifier_source === 'gemini') return 'Gemini';
  return 'Fallback';
}

function formatCommentSections(comment) {
  const c = String(comment ?? '').trim();
  if (!c) return [{ title: 'Comentário', body: 'Sem comentário.' }];
  const markers = [
    { re: /(?:^|\n)\s*(Qual o principal motivo[^:]*:)/i, title: 'Motivo da nota' },
    { re: /(?:^|\n)\s*(Pensando na sua experiência[^:]*:)/i, title: 'O que poderia melhorar' },
    { re: /(?:^|\n)\s*(O que te faria continuar[^:]*:)/i, title: 'O que faria continuar' },
    { re: /(?:^|\n)\s*(Você gostaria de adicionar[^:]*:)/i, title: 'Comentário adicional' },
  ];
  const hits = [];
  for (const m of markers) {
    const match = m.re.exec(c);
    if (match) hits.push({ index: match.index, title: m.title, len: match[1].length });
  }
  hits.sort((a, b) => a.index - b.index);
  if (hits.length < 2) return [{ title: 'Comentário completo', body: c }];
  const sections = [];
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index + hits[i].len;
    const end = i + 1 < hits.length ? hits[i + 1].index : c.length;
    sections.push({ title: hits[i].title, body: c.slice(start, end).trim() || '—' });
  }
  return sections;
}

function buildPrintHtml(row, actionProposal) {
  const plan = row.plan ?? {};
  const hasPlan = Boolean(String(actionProposal).trim());
  const topics = (row.topics ?? [])
    .map(
      (t) =>
        `<li><strong>${esc(t.topic)}</strong> — ${esc(t.valence)} <span class="muted">(${esc(vocSource(t))})</span></li>`,
    )
    .join('');
  const commentHtml = formatCommentSections(row.comment)
    .map((s) => `<h3 class="sub">${esc(s.title)}</h3><p class="comment">${esc(s.body)}</p>`)
    .join('');
  const last = getLastModification(row);
  const migration = String(row.nps_migration ?? '—').replace(' -> ', ' → ');
  const program = resolveRowProgram(row);

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Plano de Ação NPS — ${esc(row.client_name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #111; margin: 0; padding: 32px 40px; line-height: 1.5; background: #fff; }
  .brand { color: #e85d4c; font-weight: 700; font-size: 0.8rem; letter-spacing: 0.06em; text-transform: uppercase; margin: 0 0 8px; }
  h1 { font-size: 1.5rem; margin: 0 0 6px; font-weight: 700; }
  .meta { color: #64748b; font-size: 0.9rem; margin-bottom: 28px; }
  h2 { font-size: 1rem; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #e85d4c; color: #111; }
  h3.sub { font-size: 0.85rem; margin: 12px 0 4px; color: #475569; }
  .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
  dl { display: grid; grid-template-columns: 160px 1fr; gap: 8px 16px; margin: 0; }
  dt { font-weight: 600; color: #64748b; font-size: 0.85rem; }
  dd { margin: 0; font-size: 0.95rem; }
  .comment { background: #f1f5f9; padding: 12px 14px; border-radius: 8px; white-space: pre-wrap; font-size: 0.92rem; margin: 0 0 8px; }
  ul { margin: 8px 0; padding-left: 1.2rem; }
  .muted { color: #64748b; font-size: 0.85em; }
  .plan-box { border-left: 4px solid #e85d4c; padding: 12px 16px; background: #fff8f6; border-radius: 0 8px 8px 0; white-space: pre-wrap; }
  .empty { color: #64748b; font-style: italic; }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 0.75rem; color: #64748b; }
  @media print { body { padding: 20px; } h2 { break-after: avoid; } .card { break-inside: avoid; } }
</style></head><body>
<p class="brand">Analytics QuartaVia</p>
<h1>Plano de Ação NPS</h1>
<p class="meta">Gerado em ${esc(formatDate(new Date().toISOString()))}</p>
<h2>Identificação</h2>
<div class="card"><dl>
  <dt>Cliente</dt><dd>${esc(row.client_name)}</dd>
  <dt>EP</dt><dd>${esc(row.ep_name)}</dd>
  <dt>Programa</dt><dd>${esc(program)}</dd>
  <dt>Ciclo</dt><dd>${esc(row.cycle_code)}</dd>
</dl></div>
<h2>Resumo NPS</h2>
<div class="card"><dl>
  <dt>Nota atual</dt><dd>${esc(row.current_score)} (${esc(row.current_category)})</dd>
  <dt>Nota anterior</dt><dd>${esc(row.previous_score)}</dd>
  <dt>Delta</dt><dd>${esc(row.score_delta)}</dd>
  <dt>Migração</dt><dd>${esc(migration)}</dd>
</dl></div>
<h2>Voz do Cliente</h2>
${commentHtml}
<h3 class="sub">Temas identificados</h3>
<ul>${topics || '<li class="empty">Sem temas classificados.</li>'}</ul>
<h2>Prioridade</h2>
<div class="card"><dl>
  <dt>Prioridade</dt><dd>${esc(finalPriorityLabel(row))}</dd>
</dl></div>
<h2>Plano</h2>
${hasPlan ? `<div class="plan-box">${esc(actionProposal)}</div>` : '<p class="empty">Nenhum plano de ação registrado até o momento.</p>'}
<h2>Auditoria</h2>
<div class="card"><dl>
  <dt>Última modificação por</dt><dd>${esc(plan.updated_by ?? last?.email)}</dd>
  <dt>Última modificação em</dt><dd>${esc(formatDate(plan.updated_at ?? last?.at) || '—')}</dd>
</dl></div>
<footer>Gerado pelo Analytics QuartaVia</footer>
</body></html>`;
}

/**
 * Impressão/PDF via iframe oculto (evita pop-up em branco).
 */
export function exportActionPlanPdf(row, opts = {}) {
  const plan = row.plan ?? {};
  const actionProposal =
    opts.draftActionProposal ??
    plan.action_text ??
    plan.action_proposal ??
    '';
  const html = buildPrintHtml(row, actionProposal);

  let frame = document.getElementById('action-pdf-print-frame');
  if (!frame) {
    frame = document.createElement('iframe');
    frame.id = 'action-pdf-print-frame';
    frame.setAttribute('title', 'Impressão plano de ação');
    frame.style.cssText =
      'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;left:0;bottom:0;';
    document.body.appendChild(frame);
  }

  const win = frame.contentWindow;
  const doc = win.document;
  doc.open();
  doc.write(html);
  doc.close();

  const triggerPrint = () => {
    try {
      win.focus();
      win.print();
    } catch (e) {
      console.warn('[PDF] print failed', e);
    }
  };

  if (doc.readyState === 'complete') {
    setTimeout(triggerPrint, 150);
  } else {
    frame.onload = () => setTimeout(triggerPrint, 150);
  }
}
