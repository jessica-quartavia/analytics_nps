let toastTimer = null;

export function showPageToast(message, { variant = 'neutral' } = {}) {
  let el = document.getElementById('dashboard-refresh-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dashboard-refresh-toast';
    el.className = 'dashboard-refresh-toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.toggle('dashboard-refresh-toast--error', variant === 'error');
  el.classList.add('is-visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 5000);
}
