/* ==========================================================================
   ComputeIT — behaviour
   theme · nav · reveal/counters · hero canvas · code tabs ·
   architecture explorer · contact form
   ========================================================================== */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const THEME_KEY = 'computeit-theme';
  
  /* ───────── Theme ───────── */
  const currentTheme = () => root.dataset.theme || 'dark';

  function syncThemeButton() {
    const btn = $('#theme-toggle');
    if (!btn) return;
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    btn.setAttribute('aria-label', `Switch to ${next} theme`);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = currentTheme() === 'dark' ? '#050607' : '#f6f8fa';
  }

  function initTheme() {
    const btn = $('#theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* storage unavailable */ }
      syncThemeButton();
      window.dispatchEvent(new Event('themechange'));
    });
    syncThemeButton();
  }

  const cssVar = (name) => getComputedStyle(root).getPropertyValue(name).trim();

  /* ───────── Header & navigation ───────── */
  function initNav() {
    const header = $('.site-header');
    const toggle = $('#nav-toggle');
    const nav = $('#site-nav');

    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const setOpen = (open) => {
      header.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setOpen(false); toggle.focus(); }
    });
    window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });

    // Highlight the nav link for the section currently in view.
    const links = new Map($$('.site-nav a[href^="#"]').map((a) => [a.getAttribute('href').slice(1), a]));
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const link = links.get(entry.target.id);
        if (link && entry.isIntersecting) {
          links.forEach((l) => l.classList.remove('active'));
          link.classList.add('active');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }

  /* ───────── Reveal on scroll + count-up ───────── */
  function animateCount(el) {
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const suffix = el.dataset.suffix || '';
    const fmt = (v) => v.toFixed(decimals) + suffix;

    if (reduceMotion.matches) { el.textContent = fmt(target); return; }
    const duration = 1500;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * eased);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function initReveal() {
    // Stagger siblings that reveal together.
    $$('.cards, .cases').forEach((group) => {
      $$('.reveal', group).forEach((el, i) => el.style.setProperty('--i', i));
    });

    const counters = $$('.count');
    // Set final values up front for anything the observer can't handle.
    if (!('IntersectionObserver' in window)) {
      $$('.reveal').forEach((el) => el.classList.add('in'));
      counters.forEach((el) => { el.textContent = (+el.dataset.count).toFixed(+(el.dataset.decimals || 0)) + (el.dataset.suffix || ''); });
      return;
    }

    const revealObs = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        $$('.count', entry.target).forEach(animateCount);
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    $$('.reveal').forEach((el) => revealObs.observe(el));

    // Counters that aren't inside a .reveal (hero strip).
    const countObs = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateCount(entry.target);
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.6 });
    counters.filter((el) => !el.closest('.reveal')).forEach((el) => countObs.observe(el));
  }

  /* ───────── Hero: animated "SM grid" canvas ───────── */
  function initHeroCanvas() {
    const canvas = $('#hero-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const CELL = 22;
    const GAP = 5;
    const SIZE = CELL - GAP;

    let w = 0, h = 0, cols = 0, rows = 0;
    let accent = cssVar('--accent');
    let hot = cssVar('--hot');
    const mouse = { x: -9999, y: -9999 };
    const t0 = performance.now();
    let raf = 0;
    let visible = false;

    const hash = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 100;

    function draw(now) {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const px = x * CELL;
          const py = y * CELL;
          const wave = Math.max(0, Math.sin(x * 0.22 + t * 1.1) * Math.sin(y * 0.18 - t * 0.8));
          const d = Math.hypot(px - mouse.x, py - mouse.y);
          const near = Math.max(0, 1 - d / 170);
          const k = Math.min(1, wave * wave * 0.85 + near * near);
          const isHot = k > 0.28 && hash(x, y) < 6;
          ctx.globalAlpha = 0.07 + k * 0.6;
          ctx.fillStyle = isHot ? hot : accent;
          ctx.fillRect(px, py, SIZE, SIZE);
        }
      }
      ctx.globalAlpha = 1;
    }

    function loop(now) {
      draw(now);
      raf = visible ? requestAnimationFrame(loop) : 0;
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / CELL);
      rows = Math.ceil(h / CELL);
      draw(performance.now());
    }

    function refreshColors() {
      accent = cssVar('--accent');
      hot = cssVar('--hot');
      draw(performance.now());
    }

    new ResizeObserver(resize).observe(canvas);
    window.addEventListener('themechange', refreshColors);

    const hero = canvas.parentElement;
    hero.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });

    const start = () => {
      if (reduceMotion.matches) { draw(performance.now()); return; }
      if (visible && !raf) raf = requestAnimationFrame(loop);
    };
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; start(); }).observe(hero);
    reduceMotion.addEventListener('change', start);
  }

  /* ───────── Accessible tabs helper ───────── */
  function initTabs(list, onSelect) {
    const tabs = $$('[role="tab"]', list);
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      });
      if (focus) tab.focus();
      onSelect(tab);
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (e) => {
        let next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') next = tabs[0];
        else if (e.key === 'End') next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); select(next, true); }
      });
    });
    return { tabs, select };
  }

  /* ───────── Code showcase ───────── */
  const SAMPLES = {
    kernel: {
      caption: 'Tiled matrix multiply: each block stages 32×32 tiles in shared memory so every global load is reused 32 times.',
      code: `#include <cuda_runtime.h>

// C = A * B for square N×N matrices, tiled through shared memory.
template <int TILE>
__global__ void matmul(const float* __restrict__ A,
                       const float* __restrict__ B,
                       float* __restrict__ C, int N) {
    __shared__ float As[TILE][TILE];
    __shared__ float Bs[TILE][TILE];

    const int row = blockIdx.y * TILE + threadIdx.y;
    const int col = blockIdx.x * TILE + threadIdx.x;
    float acc = 0.0f;

    for (int t = 0; t < (N + TILE - 1) / TILE; ++t) {
        const int aCol = t * TILE + threadIdx.x;
        const int bRow = t * TILE + threadIdx.y;

        // Coalesced loads; out-of-range threads contribute zeros.
        As[threadIdx.y][threadIdx.x] = (row < N && aCol < N) ? A[row * N + aCol] : 0.0f;
        Bs[threadIdx.y][threadIdx.x] = (bRow < N && col < N) ? B[bRow * N + col] : 0.0f;
        __syncthreads();

        #pragma unroll
        for (int k = 0; k < TILE; ++k)
            acc += As[threadIdx.y][k] * Bs[k][threadIdx.x];
        __syncthreads();
    }

    if (row < N && col < N) C[row * N + col] = acc;
}

// Launch: 32×32 threads per block, one block per output tile.
dim3 block(32, 32);
dim3 grid((N + 31) / 32, (N + 31) / 32);
matmul<32><<<grid, block>>>(dA, dB, dC, N);`,
    },
    queue: {
      caption: 'Wait-free single-producer / single-consumer queue. Head and tail live on separate cache lines to avoid false sharing.',
      code: `#include <array>
#include <atomic>
#include <cstddef>
#include <optional>
#include <utility>

// Lock-free ring buffer. Capacity must be a power of two.
template <typename T, std::size_t N>
    requires (N >= 2 && (N & (N - 1)) == 0)
class SpscQueue {
    static constexpr std::size_t kMask = N - 1;

    alignas(64) std::atomic<std::size_t> head_{0};   // advanced by the consumer
    alignas(64) std::atomic<std::size_t> tail_{0};   // advanced by the producer
    alignas(64) std::array<T, N> slots_{};

public:
    bool try_push(T value) {
        const auto tail = tail_.load(std::memory_order_relaxed);
        if (tail - head_.load(std::memory_order_acquire) == N)
            return false;                                   // full
        slots_[tail & kMask] = std::move(value);
        tail_.store(tail + 1, std::memory_order_release);   // publish the slot
        return true;
    }

    std::optional<T> try_pop() {
        const auto head = head_.load(std::memory_order_relaxed);
        if (head == tail_.load(std::memory_order_acquire))
            return std::nullopt;                            // empty
        T value = std::move(slots_[head & kMask]);
        head_.store(head + 1, std::memory_order_release);   // free the slot
        return value;
    }
};`,
    },
    pipeline: {
      caption: 'Double-buffered pipeline: while one stream computes, the other copies. Host buffers must be pinned (cudaHostAlloc) for the overlap to work.',
      code: `#include <algorithm>
#include <cuda_runtime.h>

constexpr int kStreams = 2;
constexpr int kThreads = 256;

__global__ void transform(const float* in, float* out, size_t n);

// Overlap host→device copy, kernel and device→host copy across streams.
void run_pipeline(const float* h_in, float* h_out, size_t total, size_t chunk) {
    cudaStream_t stream[kStreams];
    float *d_in[kStreams], *d_out[kStreams];

    for (int s = 0; s < kStreams; ++s) {
        cudaStreamCreate(&stream[s]);
        cudaMalloc(&d_in[s],  chunk * sizeof(float));
        cudaMalloc(&d_out[s], chunk * sizeof(float));
    }

    size_t i = 0;
    for (size_t off = 0; off < total; off += chunk, ++i) {
        const int s = static_cast<int>(i % kStreams);
        const size_t n = std::min(chunk, total - off);
        const unsigned blocks = static_cast<unsigned>((n + kThreads - 1) / kThreads);

        cudaMemcpyAsync(d_in[s], h_in + off, n * sizeof(float),
                        cudaMemcpyHostToDevice, stream[s]);
        transform<<<blocks, kThreads, 0, stream[s]>>>(d_in[s], d_out[s], n);
        cudaMemcpyAsync(h_out + off, d_out[s], n * sizeof(float),
                        cudaMemcpyDeviceToHost, stream[s]);
    }

    cudaDeviceSynchronize();
    for (int s = 0; s < kStreams; ++s) {
        cudaFree(d_in[s]);
        cudaFree(d_out[s]);
        cudaStreamDestroy(stream[s]);
    }
}`,
    },
  };

  const CPP_KEYWORDS = new Set((
    'alignas alignof auto break case catch class const consteval constexpr continue default delete do else enum ' +
    'explicit extern for if inline namespace new noexcept nullptr operator private public requires return sizeof ' +
    'static static_cast struct switch template this throw try typename using virtual while true false ' +
    '__global__ __device__ __host__ __shared__ __restrict__ __syncthreads'
  ).split(' '));
  const CPP_TYPES = new Set((
    'void int float double bool char long short unsigned signed size_t uint32_t uint64_t int32_t int64_t ' +
    'dim3 cudaStream_t cudaError_t'
  ).split(' '));

  const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Tiny single-pass C++/CUDA highlighter: comments, strings, preprocessor, numbers, identifiers.
  function highlight(src) {
    const re = /(\/\/.*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*")|(^[ \t]*#[ \t]*\w+)|(\b\d[\d']*(?:\.\d+)?[fFuUlL]*\b)|(\b[A-Za-z_]\w*\b)/gm;
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      out += escapeHtml(src.slice(last, m.index));
      const [text, comment, string, pre, num, ident] = m;
      let cls = null;
      if (comment) cls = 'c';
      else if (string) cls = 's';
      else if (pre) cls = 'p';
      else if (num) cls = 'n';
      else if (ident) {
        if (CPP_KEYWORDS.has(ident)) cls = 'k';
        else if (CPP_TYPES.has(ident) || /^[A-Z][a-z]{2,}\w*$/.test(ident)) cls = 't';
        else if (src[re.lastIndex] === '(') cls = 'f';
      }
      out += cls ? `<span class="tok-${cls}">${escapeHtml(text)}</span>` : escapeHtml(text);
      last = re.lastIndex;
    }
    return out + escapeHtml(src.slice(last));
  }

  function initCode() {
    const list = $('#code-tabs');
    const out = $('#code-out');
    const caption = $('#code-caption');
    const panel = $('#code-panel');
    const copy = $('#copy-code');
    if (!list) return;

    let current = 'kernel';
    const show = (tab) => {
      current = tab.dataset.sample;
      out.innerHTML = highlight(SAMPLES[current].code);
      caption.textContent = SAMPLES[current].caption;
      panel.setAttribute('aria-labelledby', tab.id);
      panel.scrollLeft = 0;
    };
    const { tabs, select } = initTabs(list, show);
    select(tabs[0]);

    let timer = 0;
    const flash = (label) => {
      copy.textContent = label;
      clearTimeout(timer);
      timer = setTimeout(() => { copy.textContent = 'Copy'; }, 1600);
    };
    copy.addEventListener('click', async () => {
      const text = SAMPLES[current].code;
      try {
        await navigator.clipboard.writeText(text);
        flash('Copied ✓');
      } catch (_) {
        // Fallback for insecure contexts (e.g. file://).
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (__) { /* ignore */ }
        ta.remove();
        flash(ok ? 'Copied ✓' : 'Press Ctrl+C');
      }
    });
  }

  /* ───────── Architecture explorer ───────── */
  const ARCH = [
    {
      title: 'Clients & SDKs',
      desc: 'Typed C++ and Python SDKs over gRPC give callers a stable, versioned contract. Large payloads stream in chunks; small ones ride a single unary call.',
      tags: ['gRPC', 'Protobuf', 'Streaming', 'Idempotency keys'],
      notes: [
        'Versioned protobuf schemas with a compatibility check in CI.',
        'Client retries use jittered exponential back-off and idempotent job IDs.',
        'Zero-copy hand-off through shared memory or RDMA for same-rack callers.',
      ],
    },
    {
      title: 'Ingest gateway',
      desc: 'The front door authenticates, validates and rate-limits each request. Admission control rejects work early instead of letting queues grow without bound.',
      tags: ['mTLS', 'Token bucket', 'Admission control', 'Envoy'],
      notes: [
        'Per-tenant quotas so one noisy neighbour cannot starve everyone else.',
        'Back-pressure travels to the client as explicit "retry-after" signals.',
        'Payload size limits enforced while streaming — never buffered whole.',
      ],
    },
    {
      title: 'Batch scheduler',
      desc: 'Packs independent jobs into GPU-sized batches, honours priority classes and deadlines, and routes work to the device with the right free memory.',
      tags: ['Bin packing', 'Priority queues', 'Work stealing', 'Deadlines'],
      notes: [
        'Batches sized by memory footprint and SM demand, not just job count.',
        'Deadline-aware queues trade a little throughput for predictable tail latency.',
        'Stateless replicas; queue state is recoverable from a replicated log.',
      ],
    },
    {
      title: 'GPU worker pool',
      desc: 'Long-lived C++ workers own the device context. Memory comes from pre-allocated arenas, work runs as CUDA graphs, and copies overlap compute on separate streams.',
      tags: ['C++20', 'CUDA graphs', 'Pinned memory', 'NCCL'],
      notes: [
        'No allocation on the hot path — arenas and pools are sized at start-up.',
        'Copy/compute overlap keeps SM utilisation above 90% under load.',
        'ECC and XID errors drain a device gracefully before it is cordoned.',
      ],
    },
    {
      title: 'Results, storage & telemetry',
      desc: 'Results land in a content-addressed cache and columnar storage. Every request carries a trace ID from client to kernel, so latency has an owner.',
      tags: ['OpenTelemetry', 'Prometheus', 'CUPTI', 'Columnar store'],
      notes: [
        'p50 / p99 latency and GPU-utilisation SLOs alerted on burn rate.',
        'Nsight and CUPTI traces captured automatically in performance CI.',
        'Replayable job logs make production incidents reproducible on a laptop.',
      ],
    },
  ];

  function initArchitecture() {
    const list = $('#arch-tabs');
    if (!list) return;
    const panel = $('#arch-panel');
    const title = $('#arch-title-out');
    const desc = $('#arch-desc-out');
    const tags = $('#arch-tags-out');
    const notes = $('#arch-notes-out');
    let auto = 0;

    const show = (tab) => {
      const d = ARCH[Number(tab.dataset.node)];
      title.textContent = d.title;
      desc.textContent = d.desc;
      tags.replaceChildren(...d.tags.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
      notes.replaceChildren(...d.notes.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
      panel.setAttribute('aria-labelledby', tab.id);
    };

    const { tabs, select } = initTabs(list, show);
    select(tabs[0]);

    // Gentle auto-tour while the diagram is on screen, until the visitor takes over.
    let manual = false;
    const stopTour = () => { clearInterval(auto); auto = 0; };
    const takeOver = () => { manual = true; stopTour(); panel.setAttribute('aria-live', 'polite'); };

    if (reduceMotion.matches || !('IntersectionObserver' in window)) {
      panel.setAttribute('aria-live', 'polite');
      return;
    }

    panel.removeAttribute('aria-live'); // avoid screen-reader chatter while the tour runs
    ['pointerdown', 'keydown', 'focusin'].forEach((ev) => list.addEventListener(ev, takeOver, { once: true }));

    let idx = 0;
    new IntersectionObserver(([entry]) => {
      stopTour();
      if (manual || !entry.isIntersecting) return;
      auto = setInterval(() => { idx = (idx + 1) % tabs.length; select(tabs[idx]); }, 4200);
    }, { threshold: 0.5 }).observe(list);
  }

  /* ───────── Contact form (validates, then POSTs to /api/contact) ───────── */
  function initForm() {
    const form = $('#contact-form');
    if (!form) return;
    const status = $('#form-status');
    const token = $('#f-token');

    // Signed load time; the server drops submissions sent too soon after it.
    const loadToken = () => fetch('/api/form-token')
      .then((res) => res.json())
      .then((data) => { token.value = data.token; })
      .catch(() => {});
    loadToken();

    const rules = {
      name: { el: $('#f-name'), err: $('#e-name'), check: (v) => (v.trim().length >= 2 ? '' : 'Please enter your name.') },
      email: { el: $('#f-email'), err: $('#e-email'), check: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Please enter a valid email address.') },
      msg: { el: $('#f-msg'), err: $('#e-msg'), check: (v) => (v.trim().length >= 20 ? '' : 'Please tell us a little more (at least 20 characters).') },
    };

    const validate = (r) => {
      const message = r.check(r.el.value);
      r.err.textContent = message;
      r.el.closest('.field').classList.toggle('invalid', Boolean(message));
      r.el.setAttribute('aria-invalid', String(Boolean(message)));
      if (message) r.el.setAttribute('aria-describedby', r.err.id); else r.el.removeAttribute('aria-describedby');
      return !message;
    };

    Object.values(rules).forEach((r) => {
      r.el.addEventListener('blur', () => validate(r));
      r.el.addEventListener('input', () => { if (r.el.getAttribute('aria-invalid') === 'true') validate(r); });
    });

    const submitBtn = $('button[type="submit"]', form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.textContent = '';
      const results = Object.values(rules).map(validate);
      if (!results.every(Boolean)) {
        const firstBad = Object.values(rules).find((r) => r.el.getAttribute('aria-invalid') === 'true');
        if (firstBad) firstBad.el.focus();
        return;
      }

      submitBtn.disabled = true;
      status.textContent = 'Sending…';
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.fromEntries(new FormData(form))),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || data.message || `Request failed (${res.status})`);
        form.reset();
        status.textContent = data.message || 'Thanks — your message is in.';
        loadToken();
      } catch (err) {
        status.textContent = err.message.startsWith('This form has expired')
          ? err.message
          : 'Sorry, something went wrong sending your message. Please try again.';
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  /* ───────── Boot ───────── */
  function init() {
    const year = $('#year');
    if (year) year.textContent = String(new Date().getFullYear());
    initTheme();
    initNav();
    initReveal();
    initHeroCanvas();
    initCode();
    initArchitecture();
    initForm();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
