import { escapeHtml, escapeAttr } from '../utils/escape-html.js';

const SNAPSHOT_ASSET = '/assets/registro-ciclo-2026-10-01.png';

/**
 * Registro histórico operacional (não é NPS analítico atual).
 * Imagem: dashboard/assets/registro-ciclo-2026-10-01.png (copiada no build se existir).
 */
export function renderExecutivoCycleSnapshot() {
  return `
    <section class="card executivo-cycle-snapshot" aria-label="Registro do ciclo">
      <h2 class="section-title">Registro do ciclo</h2>
      <div class="executivo-cycle-snapshot__body">
        <div class="executivo-cycle-snapshot__meta">
          <p><strong>01/10/2026</strong></p>
          <p>NPS exibido: <strong>65*</strong></p>
          <p class="note-muted" title="Valor exibido pela fonte operacional naquele momento.">*Valor exibido pela fonte operacional naquele momento. Não substitui o NPS analítico atual do portal.</p>
        </div>
        <figure class="executivo-cycle-snapshot__figure">
          <a href="${escapeAttr(SNAPSHOT_ASSET)}" target="_blank" rel="noopener noreferrer" class="executivo-cycle-snapshot__thumb-link">
            <img
              src="${escapeAttr(SNAPSHOT_ASSET)}"
              alt="Captura de tela do NPS operacional em 01/10/2026"
              class="executivo-cycle-snapshot__thumb"
              width="160"
              height="90"
              loading="lazy"
              onerror="this.closest('.executivo-cycle-snapshot__figure').classList.add('is-missing-image')"
            />
          </a>
          <figcaption class="note-muted executivo-cycle-snapshot__missing">Arquivo de imagem pendente: adicione <code>${escapeHtml(SNAPSHOT_ASSET)}</code> (print real de 01/10).</figcaption>
        </figure>
      </div>
    </section>`;
}
