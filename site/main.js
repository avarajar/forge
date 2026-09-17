const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    return null;
  }
}

// Theme: saved choice, else the system setting (the inline script in <head> applies it before paint).
const themeBtn = document.querySelector('[data-theme-toggle]');
const heroImg = document.querySelector('[data-hero-shot]');

function applyTheme(theme) {
  root.dataset.theme = theme;
  themeBtn.textContent = theme === 'light' ? '☾' : '☀';
  heroImg.src = theme === 'light' ? 'screenshots/task-list-light.png' : 'screenshots/task-list.png';
}

function toggleTheme() {
  const next = root.dataset.theme === 'light' ? 'dark' : 'light';
  store('forge-theme', next);
  applyTheme(next);
}

applyTheme(root.dataset.theme);
themeBtn.addEventListener('click', toggleTheme);
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
    e.preventDefault();
    toggleTheme();
  }
});

// Start card: classify the input like the console's start card does.
const input = document.querySelector('[data-task]');
const tile = document.querySelector('[data-type-tile]');
const label = document.querySelector('[data-type-label]');
const msg = document.querySelector('[data-type-msg]');

function detect(value) {
  const v = value.trim();
  const dev = { label: 'Dev', glyph: 'D', color: 'var(--orange)' };
  if (!v) return { ...dev, msg: 'Type a name and Forge starts a dev task on your last project.' };
  const pr = v.match(/github\.com\/[^/]+\/([^/]+)\/pull\/\d+/);
  if (pr) return { label: 'Review', glyph: 'R', color: 'var(--blue)', msg: `Pull request detected — this becomes a review on ${pr[1]}, run by Codex.` };
  if (/^[A-Z]{2,6}-\d+/.test(v)) return { ...dev, msg: 'Linear issue detected — Forge pulls the title and starts a dev task.' };
  if (/notion\.(so|site)/.test(v)) return { ...dev, msg: 'Notion page detected — Forge reads it and starts a dev task.' };
  if (/^https?:\/\//.test(v)) return { ...dev, msg: 'Link detected — Forge starts a dev task with it as context.' };
  return { ...dev, msg: `Dev task “${v}” on your last project, in its own git worktree.` };
}

function renderDetection() {
  const d = detect(input.value);
  tile.textContent = d.glyph;
  tile.style.background = d.color;
  label.textContent = d.label;
  msg.textContent = d.msg;
}

input.addEventListener('input', renderDetection);
document.querySelectorAll('[data-try]').forEach((btn) => {
  btn.addEventListener('click', () => {
    input.value = btn.dataset.try;
    renderDetection();
  });
});
renderDetection();

// Copy buttons copy the sibling <code>.
document.querySelectorAll('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const code = btn.parentElement.querySelector('code');
    try {
      await navigator.clipboard.writeText(code.textContent.trim());
    } catch {
      return;
    }
    btn.textContent = 'Copied';
    clearTimeout(btn._reset);
    btn._reset = setTimeout(() => { btn.textContent = 'Copy'; }, 1400);
  });
});

// Live session card: a demo context meter that climbs and resets.
const ctxPct = document.querySelector('[data-ctx-pct]');
const ctxMeta = document.querySelector('[data-ctx-meta]');
const ctxFill = document.querySelector('[data-ctx-fill]');
let ctx = 41;

function renderCtx() {
  ctxPct.textContent = ctx;
  ctxMeta.textContent = `${(ctx * 3.1).toFixed(0)}k · $${(ctx * 0.058).toFixed(2)}`;
  ctxFill.style.width = `${ctx}%`;
}

renderCtx();
if (!reduced) {
  setInterval(() => {
    ctx = ctx >= 92 ? 14 : ctx + 1 + Math.floor(Math.random() * 3);
    renderCtx();
  }, 2200);
}

// Real star count; the counters stay hidden when it can't be read or is zero.
fetch('https://api.github.com/repos/avarajar/forge')
  .then((r) => (r.ok ? r.json() : null))
  .then((repo) => {
    const n = repo?.stargazers_count;
    if (!n) return;
    const text = n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
    document.querySelectorAll('[data-stars]').forEach((el) => {
      el.querySelector('[data-stars-n]').textContent = text;
      el.hidden = false;
    });
  })
  .catch(() => {});

// Reveal on scroll. The hidden state is set here so the page reads fine without JS.
if (!reduced && 'IntersectionObserver' in window) {
  const targets = [...document.querySelectorAll('[data-reveal] > *')];
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.style.opacity = '1';
      e.target.style.transform = 'none';
      // Hand the element back to its stylesheet transitions (card hover lifts).
      e.target.addEventListener('transitionend', () => e.target.removeAttribute('style'), { once: true });
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
  targets.forEach((el, i) => {
    const delay = (i % 4) * 70;
    el.style.opacity = '0';
    el.style.transform = 'translateY(16px)';
    el.style.transition = `opacity .6s var(--ease) ${delay}ms, transform .6s var(--ease) ${delay}ms`;
    io.observe(el);
  });
}
