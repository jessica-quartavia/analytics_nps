/**
 * Registro histórico operacional (não substitui o NPS analítico atual).
 */
export function renderExecutivoCycleSnapshot() {
  return `
    <section class="card executivo-cycle-snapshot" aria-label="Registro do ciclo">
      <h2 class="section-title">Registro do ciclo</h2>
      <div class="executivo-cycle-snapshot__body">
        <p class="executivo-cycle-snapshot__date"><strong>01/10/2026</strong></p>
        <p class="executivo-cycle-snapshot__nps">NPS exibido: <strong>65*</strong></p>
        <p class="note-muted executivo-cycle-snapshot__note">*Valor exibido pela fonte operacional em 01/10/2026. Este registro é histórico e não substitui o NPS analítico atual exibido no portal.</p>
      </div>
    </section>`;
}
