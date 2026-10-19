import { renderMovimentoChangeDriversSection, bindMovimentoChangeDrivers } from './movimento-change-drivers.js';

/** Fatores associados à mudança (sem quadrantes “O que aconteceu entre ciclos”). */
export function renderMovimentoBetweenCyclesSection(_filterCtx) {
  return renderMovimentoChangeDriversSection();
}

export function bindMovimentoBetweenCycles(_root, _filterCtx, _signal) {
  bindMovimentoChangeDrivers();
}

export const renderMovimentoJornadaSection = renderMovimentoBetweenCyclesSection;
