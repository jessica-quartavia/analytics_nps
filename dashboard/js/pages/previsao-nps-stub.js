/**
 * Placeholder temporário — não importar previsao-nps.js até reativar a projeção completa.
 */
export function renderPrevisaoNpsStub(container) {
  container.innerHTML = `
    <div class="previsao-nps-page previsao-nps-stub">
      <header class="page-header">
        <h1>Projeção NPS <span class="nav-badge nav-badge--pill nav-badge--construction">Em construção</span></h1>
      </header>
      <div class="previsao-nps-stub__wrap">
        <article class="card previsao-nps-stub__card" role="status">
          <div class="previsao-nps-stub__icon" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M3 3v18h18"/>
              <path d="M7 14l3-3 4 4 6-8"/>
            </svg>
          </div>
          <p class="previsao-nps-stub__eyebrow">Em construção</p>
          <p class="previsao-nps-stub__text">Estamos ajustando a modelagem e a integração com os dados atuais da BASE QV. Esta funcionalidade será disponibilizada novamente após a validação completa da projeção.</p>
        </article>
      </div>
    </div>`;
}
