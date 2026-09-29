/** AbortController por página — evita listeners duplicados no re-render SPA. */
let pageController = null;

export function beginPageBindings() {
  pageController?.abort();
  pageController = new AbortController();
  return pageController.signal;
}

export function getPageSignal() {
  return pageController?.signal;
}

let filterController = null;

export function beginFilterBindings() {
  filterController?.abort();
  filterController = new AbortController();
  return filterController.signal;
}
