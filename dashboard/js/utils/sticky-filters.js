export const STICKY_FILTERS_STORAGE_KEY = 'analytics-nps:sticky-filters';

export function stickyFiltersEnabled() {
  try {
    return sessionStorage.getItem(STICKY_FILTERS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setStickyFiltersEnabled(enabled) {
  try {
    sessionStorage.setItem(STICKY_FILTERS_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    applyStickyFiltersDom(enabled);
  }
}

export function applyStickyFiltersDom(enabled = stickyFiltersEnabled()) {
  if (typeof document === 'undefined') return;
  const bar = document.getElementById('filters-bar');
  if (!bar) return;
  bar.classList.toggle('is-sticky', enabled);
  if (!enabled) bar.classList.remove('has-scroll-shadow');
}

let scrollController = null;

/** Observa sentinel para sombra ao rolar (sem duplicar listeners). */
export function mountFilterScrollWatch(pageSignal) {
  scrollController?.abort();
  scrollController = new AbortController();
  const { signal } = scrollController;

  if (pageSignal) {
    pageSignal.addEventListener('abort', () => scrollController?.abort(), { once: true });
  }

  const bar = document.getElementById('filters-bar');
  const sentinel = document.getElementById('filter-scroll-sentinel');
  if (!bar || !sentinel || !stickyFiltersEnabled()) return;

  const io = new IntersectionObserver(
    ([entry]) => {
      bar.classList.toggle('has-scroll-shadow', !entry.isIntersecting);
    },
    { threshold: [0], rootMargin: '0px 0px 0px 0px' },
  );
  io.observe(sentinel);
  signal.addEventListener('abort', () => io.disconnect());
}
