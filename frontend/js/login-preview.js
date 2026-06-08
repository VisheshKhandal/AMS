/**
 * Login page — preview animations & polish
 */

const LOGIN_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

function animateCount(el, target, { suffix = '', duration = 1200, decimals = 0 } = {}) {
  const start = performance.now();
  const from = 0;

  const step = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - t) ** 3;
    const value = from + (target - from) * eased;
    el.textContent = decimals > 0 ? `${value.toFixed(decimals)}${suffix}` : `${Math.round(value)}${suffix}`;
    if (t < 1) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

function initChartDraw() {
  const line = document.querySelector('.login-chart-line');
  if (!line) return;

  const length = line.getTotalLength?.() ?? 400;
  line.style.strokeDasharray = String(length);
  line.style.strokeDashoffset = String(length);
  line.style.transition = `stroke-dashoffset 1.6s ${LOGIN_EASE}`;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      line.style.strokeDashoffset = '0';
    });
  });

  const area = document.querySelector('.login-chart-area');
  if (area) {
    area.style.opacity = '0';
    area.style.transition = `opacity 1s ${LOGIN_EASE} 0.6s`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        area.style.opacity = '1';
      });
    });
  }

  const dot = document.querySelector('.login-chart-dot');
  if (dot) {
    dot.style.opacity = '0';
    dot.style.transition = `opacity 0.4s ${LOGIN_EASE} 1.5s, transform 0.4s cubic-bezier(0.34, 1.4, 0.64, 1) 1.5s`;
    dot.style.transform = 'scale(0)';
    dot.style.transformOrigin = 'center';
    dot.style.transformBox = 'fill-box';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dot.style.opacity = '1';
        dot.style.transform = 'scale(1)';
      });
    });
  }
}

function staggerTimeline() {
  document.querySelectorAll('.login-timeline .timeline-item').forEach((item, i) => {
    item.style.opacity = '0';
    item.style.transform = 'translateX(-10px)';
    item.style.transition = `opacity 0.45s ${LOGIN_EASE}, transform 0.45s ${LOGIN_EASE}`;
    item.style.transitionDelay = `${0.7 + i * 0.1}s`;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        item.style.opacity = '1';
        item.style.transform = 'translateX(0)';
      });
    });
  });
}

function initCountUps() {
  document.querySelectorAll('[data-count]').forEach((el, i) => {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    setTimeout(() => animateCount(el, target, { suffix, decimals }), 400 + i * 120);
  });
}

function initReveals() {
  const shell = document.querySelector('.login-shell');
  if (!shell) return;

  requestAnimationFrame(() => {
    shell.classList.add('is-ready');
  });
}

function initSubtleParallax() {
  const panel = document.querySelector('.login-preview-canvas');
  if (!panel || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let raf = null;
  document.addEventListener('mousemove', (e) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      const { innerWidth: w, innerHeight: h } = window;
      const x = (e.clientX / w - 0.5) * 6;
      const y = (e.clientY / h - 0.5) * 4;
      panel.style.transform = `translate(${x}px, ${y}px)`;
    });
  });
}

function syncAuthViewsHeight() {
  const authViews = document.getElementById('authViews');
  const active = authViews?.querySelector('.login-auth-view.is-active:not([hidden])');
  if (!authViews || !active) return;

  authViews.style.height = 'auto';
  authViews.style.minHeight = `${active.scrollHeight + 32}px`;
}

window.syncAuthViewsHeight = syncAuthViewsHeight;

function refreshLoginTheme() {
  document.body.dataset.loginTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  document.body.dataset.loginAccent = document.documentElement.getAttribute('data-accent') || 'blue';
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page !== 'login') return;

  refreshLoginTheme();
  initReveals();
  initCountUps();
  initChartDraw();
  staggerTimeline();
  initSubtleParallax();
  syncAuthViewsHeight();

  window.addEventListener('resize', syncAuthViewsHeight);
  window.addEventListener('preferences:theme', refreshLoginTheme);
  window.addEventListener('preferences:accent', refreshLoginTheme);
  window.addEventListener('storage', (e) => {
    if (e.key === 'appTheme' || e.key === 'appAccent') refreshLoginTheme();
  });
});
