/**
 * Model Effort Slider — Client half.
 *
 * Replaces the composer's model-strength control with a dark card: the current
 * effort as a headline, the model as a drill-in row, and the effort levels as a
 * slider with one dot per level.
 *
 * How it replaces the shipped control: `conversation.input.model` is a `single`
 * slot, and the slot core lets a second registration shadow an occupied cell by
 * registering at a lower `priority` (lowest live entry renders). The shipped
 * selector sits at priority 0, so this one registers at -1. The shipped plugin
 * keeps its registration, the composer keeps its `/model` popup, and removing
 * this bundle restores the original control with no residue.
 *
 * Where the data comes from: the same per-session ModelDirectory the shipped
 * seat uses (ctx.modelDirectories). Submitting goes through
 * `directory.select(...)`, so the Host, the session log, and what the model sees
 * are untouched — this is a different drawing of one existing control.
 *
 * Failure posture: `apply` waits for the `modelDirectories` service; if that
 * service never appears this plugin never registers and the shipped control
 * stays on screen.
 */

window.__ModuleLoader__.load({
  id: 'dsh-effort-mascot',
  factory(require) {
    const React = require('react');
    const { createPortal } = require('react-dom');
    const h = React.createElement;

    const NS = 'modelEffort';
    const STYLE_ID = 'dsh-effort-mascot/model-effort.css';
    /** Half the slider thumb: the travel of a range thumb's centre from either edge. */
    const THUMB_PAD = 14;
    /** Gap between the card and its trigger, and the viewport clamp. */
    const GAP = 8;
    const MARGIN = 12;

    const DICT = {
      zh: {
        'dialog.aria': '模型强度',
        'trigger.select': '选择模型',
        'trigger.aria': '模型：{model}',
        'trigger.ariaEffort': '模型：{model}，强度：{effort}',
        'effort.default': '默认强度',
        'pane.model': '选择模型',
        'pane.back': '返回强度',
        'status.loading': '正在加载模型…',
        'status.empty': '没有可用模型',
        'max.splash': '思考强度最大时，可能消耗更多词元',
        'max.badge': '终极',
        'error.prefix': '切换失败',
        'error.fallback': '未知错误',
        retry: '重试',
      },
      en: {
        'dialog.aria': 'Model strength',
        'trigger.select': 'Select model',
        'trigger.aria': 'Model: {model}',
        'trigger.ariaEffort': 'Model: {model}, effort: {effort}',
        'effort.default': 'Provider default',
        'pane.model': 'Choose model',
        'pane.back': 'Back to strength',
        'status.loading': 'Loading models…',
        'status.empty': 'No models available',
        'max.splash': 'Maximum reasoning effort — may use more tokens',
        'max.badge': 'ULTRA',
        'error.prefix': 'Switch failed',
        'error.fallback': 'Unknown error',
        retry: 'Retry',
      },
    };

    /**
     * One visual identity per effort position: the icon tint, the headline
     * colour, and the slider gradient. Index-based (0 = weakest) so any
     * adapter's level list gets the same calm-to-hot ramp regardless of how it
     * names its levels.
     */
    const TIERS = [
      { color: '#c8ccd4', gradient: ['#4a4c53', '#6d7079'] },
      { color: '#5aa2ff', gradient: ['#2f6bff', '#5aa2ff'] },
      { color: '#b98bff', gradient: ['#3f6ef0', '#8a5bff', '#c07bff'] },
      { color: '#ff6b9d', gradient: ['#3f6ef0', '#9b5bff', '#ff5c93'] },
    ];

    /** Top level gets the gold "ultra" identity: amber bolt, badge, live track. */
    const ULTRA = {
      color: 'var(--dsw-static-amber-400)',
      gradient: ['#4f6bff', '#a855f7', 'var(--dsw-static-amber-400)'],
    };

    /**
     * Tier illustrations, keyed by adapter effort id. The file ships in
     * `assets/` and the Host half serves it at /model-effort/asset/<name>;
     * a Client bundle cannot import an image directly.
     */
    const TIER_IMAGES = {
      off: 'off.webp',
      low: 'low.webp',
      high: 'high.webp',
      max: 'max.webp',
    };

    /** Chinese headline per adapter effort id; unknown ids keep the adapter name. */
    const TIER_NAMES = {
      off: '关闭',
      none: '关闭',
      minimal: '轻度',
      low: '轻度',
      medium: '中度',
      high: '高级',
      xhigh: '极高',
      max: 'Ultra',
      ultra: '终极',
    };

    const CSS = `
.mec-root{position:relative;display:inline-flex;min-width:0}
.mec-trigger{display:flex;align-items:center;gap:4px;min-width:0;max-width:min(360px,45cqw);height:28px;padding:0 4px 0 8px;border:none;border-radius:var(--dsw-radius-sm);outline:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:400;line-height:20px;cursor:pointer}
.mec-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.mec-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-border-l3))}
.mec-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.mec-trigger-icon{display:var(--dsh-composer-model-icon-display,none);flex:none}
.mec-trigger-label,.mec-trigger-effort{display:var(--dsh-composer-model-text-display,block);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mec-trigger-effort{flex-shrink:1000;color:var(--dsw-alias-label-caption)}
.mec-chevron{flex:none;color:var(--dsw-alias-label-caption);transition:transform .12s ease}
.mec-chevron-open{transform:rotate(180deg)}
.mec-spin{flex:none;color:var(--dsw-alias-label-caption);animation:mec-spin 1s linear infinite}
@keyframes mec-spin{to{transform:rotate(360deg)}}

.mec-card{position:fixed;z-index:1200;box-sizing:border-box;display:flex;flex-direction:column;width:min(360px,calc(100vw - 24px));padding:12px 14px 14px;border:1px solid var(--dsw-static-neutral-bluish-750);border-radius:var(--dsw-radius-lg);background:var(--dsw-static-neutral-bluish-875);color:var(--dsw-static-neutral-bluish-100);box-shadow:0 16px 40px color-mix(in srgb,var(--dsw-static-neutral-bluish-1000) 34%,transparent),0 2px 8px color-mix(in srgb,var(--dsw-static-neutral-bluish-1000) 20%,transparent);--dsh-scrollbar-thumb:var(--dsw-static-neutral-bluish-700);--dsh-scrollbar-thumb-hover:var(--dsw-static-neutral-bluish-600)}
.mec-layout{display:flex;align-items:center;gap:10px}
.mec-main{display:flex;flex:1;flex-direction:column;justify-content:center;min-width:0;animation:mec-veil .18s ease-out both}
.mec-main-splash{justify-content:center}
.mec-main-list{justify-content:flex-start}
.mec-hero{position:relative;display:flex;flex:none;align-items:flex-end;justify-content:center;width:112px;height:112px;overflow:hidden}
.mec-hero-img{display:block;height:100%;width:100%;object-fit:contain;object-position:center bottom;animation:mec-veil .12s ease-out both;filter:drop-shadow(0 6px 14px color-mix(in srgb,var(--dsw-static-neutral-bluish-1000) 38%,transparent))}
.mec-head-row{display:flex;align-items:center;gap:5px;min-width:0}
.mec-splash{display:flex;align-items:center;justify-content:center;min-height:112px;padding:0 4px;text-align:center;font-size:17px;font-weight:700;line-height:26px;letter-spacing:.3px;white-space:nowrap;color:var(--dsw-static-amber-400);text-shadow:0 0 14px color-mix(in srgb,var(--dsw-static-amber-400) 58%,transparent);animation:mec-splash 3s ease-in-out both}
@keyframes mec-splash{0%{opacity:0;transform:scale(.96)}8%{opacity:1;transform:scale(1)}52%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1)}}
@keyframes mec-veil{from{opacity:0}to{opacity:1}}
.mec-bolt{display:inline-flex;flex:none;filter:drop-shadow(0 0 5px currentColor)}
.mec-bolt-svg{display:block}
.mec-tier-title{font-size:15px;font-weight:600;line-height:20px;letter-spacing:.3px}
.mec-tier-latin{overflow:hidden;font-size:12px;line-height:16px;color:var(--dsw-static-neutral-bluish-500);text-overflow:ellipsis;white-space:nowrap}
.mec-badge{flex:none;margin-left:1px;padding:0 5px;border-radius:999px;font-size:10px;font-weight:600;line-height:14px;letter-spacing:.4px;color:var(--dsw-static-amber-400);background:color-mix(in srgb,var(--dsw-static-amber-400) 18%,transparent)}
.mec-bolt-top{animation:mec-pulse 1.9s ease-in-out infinite}
.mec-range-top::-webkit-slider-runnable-track{animation:mec-breathe 3.8s ease-in-out infinite}
.mec-dot-spark{animation:mec-twinkle 1.9s ease-in-out infinite}
@keyframes mec-pulse{0%,100%{transform:scale(1);filter:drop-shadow(0 0 4px currentColor)}50%{transform:scale(1.26);filter:drop-shadow(0 0 15px currentColor)}}
@keyframes mec-breathe{0%,100%{filter:brightness(1.05)}50%{filter:brightness(1.4)}}
@keyframes mec-twinkle{0%,100%{opacity:.3;transform:translate(-50%,-50%) scale(.8)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.4)}}

@property --mec-angle{syntax:'<angle>';inherits:false;initial-value:0deg}
.mec-card-ultra{animation:mec-card-breathe 3.8s ease-in-out infinite}
.mec-card-ultra::after{content:'';position:absolute;inset:-1px;padding:1px;border-radius:inherit;pointer-events:none;background:conic-gradient(from var(--mec-angle),#4f6bff,#a855f7,#ffb648,#4f6bff);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:mec-card-ring 7.6s linear infinite}
@keyframes mec-card-ring{to{--mec-angle:360deg}}
@keyframes mec-card-breathe{
  0%,100%{box-shadow:0 16px 40px color-mix(in srgb,var(--dsw-static-neutral-bluish-1000) 34%,transparent),0 0 0 0 color-mix(in srgb,var(--dsw-static-amber-400) 0%,transparent);filter:brightness(1)}
  50%{box-shadow:0 16px 46px color-mix(in srgb,var(--dsw-static-neutral-bluish-1000) 40%,transparent),0 0 32px 3px color-mix(in srgb,var(--dsw-static-amber-400) 46%,transparent);filter:brightness(1.09)}
}
.mec-sheen{position:absolute;left:0;top:2px;height:26px;width:var(--mec-fill,0px);overflow:hidden;border-radius:999px;pointer-events:none}
/* The band starts fully outside the clip on the left and parks fully outside on
   the right, so the loop restarts while it is invisible — no visible snap. */
.mec-sheen::after{content:'';position:absolute;inset:0;background:linear-gradient(100deg,transparent 32%,color-mix(in srgb,var(--dsw-static-neutral-00) 62%,transparent) 50%,transparent 68%);background-size:200% 100%;background-position:200% 0;animation:mec-sheen 3.8s linear infinite}
/* Conveyor, not a pass: 200% -> 0% travels exactly one background tile, so the
   loop point is pixel-identical and the highlight never snaps back into view. */
@keyframes mec-sheen{from{background-position:200% 0}to{background-position:0% 0}}
.mec-model{display:inline-flex;align-items:center;align-self:flex-start;gap:2px;max-width:100%;margin:0 0 0 -2px;padding:0 3px;border:0;border-radius:5px;background:transparent;color:var(--dsw-static-neutral-bluish-500);font-size:12px;line-height:16px;cursor:pointer}
.mec-model:hover,.mec-model:focus-visible{background:var(--dsw-static-neutral-bluish-800);color:var(--dsw-static-neutral-bluish-300);outline:none}
.mec-model-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mec-model .mec-chevron{opacity:.6}

.mec-slider{position:relative;margin-top:8px;height:30px}
.mec-range{-webkit-appearance:none;appearance:none;display:block;width:100%;height:30px;margin:0;padding:0;background:transparent;cursor:pointer;outline:none}
.mec-range::-webkit-slider-runnable-track{height:26px;border-radius:999px;background:var(--mec-track,var(--dsw-static-neutral-bluish-800))}
.mec-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:28px;height:28px;margin-top:-1px;border:0;border-radius:50%;background:var(--dsw-static-neutral-00);box-shadow:0 2px 9px color-mix(in srgb,var(--dsw-static-neutral-bluish-1000) 45%,transparent);cursor:grab}
.mec-range::-moz-range-track{height:26px;border-radius:999px;background:var(--dsw-static-neutral-bluish-800)}
.mec-range::-moz-range-thumb{width:28px;height:28px;border:0;border-radius:50%;background:var(--dsw-static-neutral-00);box-shadow:0 2px 9px color-mix(in srgb,var(--dsw-static-neutral-bluish-1000) 45%,transparent);cursor:grab}
.mec-range:disabled{cursor:default;opacity:.55}
.mec-dots{position:absolute;inset:0;pointer-events:none}
.mec-dot{position:absolute;top:15px;width:4px;height:4px;border-radius:50%;background:var(--dsw-static-neutral-bluish-600);transform:translate(-50%,-50%)}
.mec-dot-on{background:var(--dsw-static-neutral-bluish-50)}

.mec-head{display:flex;align-items:center;gap:6px;margin:-2px 0 6px}
.mec-back{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-static-neutral-bluish-500);cursor:pointer}
.mec-back:hover,.mec-back:focus-visible{background:var(--dsw-static-neutral-bluish-800);color:var(--dsw-static-neutral-bluish-100);outline:none}
.mec-head-title{font-size:13px;line-height:18px;color:var(--dsw-static-neutral-bluish-300)}
.mec-list{display:flex;flex-direction:column;gap:1px;max-height:260px;overflow-y:auto;margin:0 -6px;padding:0 6px}
.mec-group{padding:6px 2px 2px;font-size:11px;line-height:16px;color:var(--dsw-static-neutral-bluish-600)}
.mec-opt{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:6px 8px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-static-neutral-bluish-100);font-size:13px;line-height:18px;text-align:left;cursor:pointer}
.mec-opt:hover,.mec-opt:focus-visible{background:var(--dsw-static-neutral-bluish-800);outline:none}
.mec-opt-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mec-check{flex:none;color:var(--dsw-static-deepseek-400)}

.mec-status{padding:8px 2px 2px;font-size:12px;line-height:16px;color:var(--dsw-static-neutral-bluish-500)}
.mec-error{display:flex;align-items:flex-start;gap:8px;margin-top:10px;padding:6px 8px;border-radius:var(--dsw-radius-sm);background:var(--dsw-static-neutral-bluish-800);color:var(--dsw-static-red-400);font-size:12px;line-height:16px}
.mec-error-text{flex:1;min-width:0;word-break:break-word}
.mec-retry{flex:none;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}
@media (prefers-reduced-motion:reduce){.mec-spin,.mec-bolt-top,.mec-dot-spark,.mec-card-ultra,.mec-sheen::after{animation:none}.mec-card-ultra::after{animation:none}.mec-hero-img{animation:none}.mec-splash{animation:none}.mec-range-top::-webkit-slider-runnable-track{animation:none}.mec-chevron{transition:none}}
`;

    const MEASURE_STYLE = { visibility: 'hidden', left: 0, top: 0 };

    /* ── inline glyphs (no Client package imports) ───────────────────────── */

    /**
     * @param {string} className - class carrying the colour.
     * @param {'down'|'right'|'left'} direction - chevron pointing.
     */
    function chevron(className, direction) {
      const path = direction === 'right'
        ? 'M6 3.5 10.5 8 6 12.5'
        : direction === 'left'
          ? 'M10 3.5 5.5 8 10 12.5'
          : 'M3.5 6 8 10.5 12.5 6';
      return h('svg', {
        className, width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
      }, h('path', {
        d: path, stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
      }));
    }

    /** Compact "model" glyph for the collapsed composer row. */
    function modelsGlyph() {
      return h('svg', {
        className: 'mec-trigger-icon', width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
      },
        h('ellipse', { cx: 8, cy: 4, rx: 5.2, ry: 2.2, stroke: 'currentColor', strokeWidth: 1.2 }),
        h('path', {
          d: 'M2.8 4v8c0 1.2 2.33 2.2 5.2 2.2s5.2-1 5.2-2.2V4', stroke: 'currentColor', strokeWidth: 1.2,
        }),
        h('path', {
          d: 'M2.8 8c0 1.2 2.33 2.2 5.2 2.2s5.2-1 5.2-2.2', stroke: 'currentColor', strokeWidth: 1.2,
        }));
    }

    function checkGlyph() {
      return h('svg', {
        className: 'mec-check', width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
      }, h('path', {
        d: 'M3 8.4 6.3 11.7 13 4.6', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
      }));
    }

    /**
     * Filled lightning bolt carrying the current tier colour.
     * @returns {object} React element.
     */
    function boltGlyph() {
      return h('svg', {
        className: 'mec-bolt-svg', width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': true,
      }, h('path', {
        d: 'M9.1 1 3.4 9h3.2L6 15l5.9-8.2H8.6z', fill: 'currentColor',
      }));
    }

    function spinnerGlyph() {
      return h('svg', {
        className: 'mec-spin', width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
      }, h('path', {
        d: 'M8 2.5a5.5 5.5 0 1 1-5.2 7.3', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round',
      }));
    }

    /* ── helpers ────────────────────────────────────────────────────────── */

    /** Effort levels of one model route, in slider order. */
    function stopsOf(reasoning, t) {
      if (reasoning === undefined || reasoning === null) return [];
      const stops = [];
      if (reasoning.defaultEffort === undefined) {
        stops.push({ key: 'provider-default', effort: undefined, label: t('effort.default') });
      }
      for (const effort of reasoning.efforts ?? []) {
        stops.push({ key: `effort:${effort.id}`, effort: effort.id, label: effort.name });
      }
      return stops;
    }

    /** Slider travel expression shared by the fill edge and the dot positions. */
    function travel(ratio) {
      return `calc(${THUMB_PAD}px + (100% - ${THUMB_PAD * 2}px) * ${ratio})`;
    }

    /**
     * Track background for one tier: the tier's colours up to the thumb, then
     * the empty rail.
     * @param {string[]} colors - tier colours ordered weakest-brightest.
     * @param {number} ratio - fill fraction of the whole track.
     * @returns {string} a CSS gradient value.
     */
    function trackGradient(colors, ratio) {
      const stops = colors.map((color, index) => {
        const at = index === 0 ? '0' : travel(ratio * (index / (colors.length - 1)));
        return `${color} ${at}`;
      });
      const edge = travel(ratio);
      const rail = 'var(--dsw-static-neutral-bluish-800)';
      return `linear-gradient(90deg, ${stops.join(', ')}, ${rail} ${edge}, ${rail} 100%)`;
    }

    function injectStyle() {
      if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return () => {};
      const tag = document.createElement('style');
      tag.dataset.pluginCss = STYLE_ID;
      tag.dataset.plugin = 'dsh-effort-mascot';
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return () => { tag.remove(); };
    }

    /**
     * POST one diagnostic line to the Host sink.
     * @param {{where: string, message: string, stack: string}} payload - one line.
     * @returns {void}
     */
    function post(payload) {
      try {
        void fetch('/model-effort/log', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {});
      } catch {
        // Reporting must never become a second failure.
      }
    }

    /**
     * @param {unknown} value - thrown value or already-stringified detail.
     * @returns {string} a loggable one-line message.
     */
    function messageOf(value) {
      if (value instanceof Error) return value.message;
      return typeof value === 'string' ? value : String(value);
    }

    /**
     * Opt-in trace channel, enabled only by `globalThis.__MEC_TRACE = true`.
     *
     * Nothing is written on a normal install: the sink must never persist which
     * model or effort the user picked. State dumps and commit payloads are
     * development aids, not telemetry.
     * @param {string} where - trace point ('state', 'commit', 'apply').
     * @param {unknown} detail - what to record.
     * @returns {void}
     */
    function trace(where, detail) {
      if (globalThis.__MEC_TRACE !== true) return;
      console.log('[mec]', where, detail);
      post({ where, message: messageOf(detail), stack: '' });
    }

    /**
     * Send one Client-side failure to the Host's diagnostic sink. The browser
     * console is unreadable from a shell, so a render crash that the slot
     * supervisor swallowed would otherwise leave no trace.
     * @param {string} where - phase that failed ('apply', 'body', 'card', 'effect').
     * @param {unknown} error - thrown value.
     * @returns {void}
     */
    function report(where, error) {
      if (globalThis.__MEC_TRACE === true) console.log('[mec]', where, error);
      post({
        where,
        message: messageOf(error),
        stack: error instanceof Error ? error.stack ?? '' : '',
      });
    }

    /**
     * Keeps a component crash inside the card: the trigger (and therefore the
     * composer row) survives, and the next mount retries.
     */
    class CardBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }

      static getDerivedStateFromError() {
        return { failed: true };
      }

      componentDidCatch(error) {
        report('card', error);
      }

      render() {
        return this.state.failed ? null : this.props.children;
      }
    }

    /* ── the seat component ─────────────────────────────────────────────── */

    /**
     * @param {object} props - owner share (`locked`), session standard kit
     * (`sessionId`), and the injected directory face.
     */
    function ModelEffortCard({
      locked, available, directory, load, select, t,
    }) {
      const state = React.useSyncExternalStore(
        (onChange) => directory.subscribe(onChange),
        () => directory.getSnapshot(),
      );
      const [open, setOpen] = React.useState(false);
      const [pane, setPane] = React.useState('effort');
      const [preview, setPreview] = React.useState(null);
      const [error, setError] = React.useState(null);
      const [pos, setPos] = React.useState(null);
      /** Transient "entered the top tier" splash; see the effect below. */
      const [splash, setSplash] = React.useState(false);
      const rootRef = React.useRef(null);
      const triggerRef = React.useRef(null);
      const cardRef = React.useRef(null);
      const inflightRef = React.useRef(null);
      const lastCommitAtRef = React.useRef(0);
      const previewRef = React.useRef(null);
      const commitRef = React.useRef(null);
      previewRef.current = preview;

      const groups = state.groups ?? [];
      let currentChoice;
      for (const group of groups) {
        for (const model of group.models) {
          if (state.current !== null
            && state.current !== undefined
            && state.current.provider === group.id
            && state.current.model === model.id) {
            currentChoice = { group, model };
          }
        }
      }
      const reasoning = currentChoice?.model.reasoning;
      const stops = stopsOf(reasoning, t);
      const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort;
      const currentStopIndex = stops.findIndex((stop) => stop.effort === effectiveEffort);
      const pendingStopIndex = state.pending === null || state.pending === undefined
        ? -1
        : stops.findIndex((stop) => stop.effort === state.pending.reasoningEffort);
      const displayIndex = Math.min(
        Math.max(preview ?? (pendingStopIndex >= 0 ? pendingStopIndex : currentStopIndex), 0),
        Math.max(stops.length - 1, 0),
      );
      const busy = state.pending !== null && state.pending !== undefined;
      const loading = state.status === 'loading' && groups.length === 0;

      const modelLabel = currentChoice?.model.name ?? t('trigger.select');
      const topStopIndex = stops.length > 1 ? stops.length - 1 : -1;
      const effortLabel = currentChoice === undefined
        ? undefined
        : reasoning === undefined || reasoning === null
          ? state.retainedEffort
          : currentStopIndex >= 0 && currentStopIndex === topStopIndex
            ? 'Ultra'
            : stops[currentStopIndex]?.label ?? effectiveEffort;
      const triggerLabel = effortLabel === undefined ? modelLabel : `${modelLabel} · ${effortLabel}`;
      const triggerAria = currentChoice === undefined
        ? t('trigger.select')
        : effortLabel === undefined
          ? t('trigger.aria', { model: modelLabel })
          : t('trigger.ariaEffort', { model: modelLabel, effort: effortLabel });
      const stop = stops[displayIndex];
      const isTop = stops.length > 1 && displayIndex === stops.length - 1;
      const tier = isTop ? ULTRA : TIERS[Math.min(Math.max(displayIndex, 0), TIERS.length - 1)];
      const tierCn = stop === undefined ? undefined : TIER_NAMES[stop.effort];
      const tierName = stop === undefined ? modelLabel : tierCn ?? stop.label;
      const tierLatin = tierCn === undefined || tierCn === stop.label ? undefined : stop.label;
      const tierImage = stop === undefined ? undefined : TIER_IMAGES[stop.effort];

      const close = (restoreFocus) => {
        if (previewRef.current !== null) commitRef.current?.(previewRef.current, 'close');
        setOpen(false);
        setSplash(false);
        setPane('effort');
        setPreview(null);
        setError(null);
        if (restoreFocus === true) {
          queueMicrotask(() => { triggerRef.current?.focus(); });
        }
      };

      const show = () => {
        setPreview(null);
        setError(null);
        setPane(state.current === null || state.current === undefined ? 'model' : 'effort');
        setOpen(true);
        load();
      };

      const traceRef = React.useRef('');
      React.useEffect(() => {
        const sig = JSON.stringify({
          isTop,
          display: displayIndex,
          current: state.current?.reasoningEffort ?? null,
          pending: state.pending?.reasoningEffort ?? null,
          status: state.status,
        });
        if (traceRef.current === sig) return;
        traceRef.current = sig;
        trace('state', sig);
      }, [isTop, displayIndex, state]);

      React.useEffect(() => {
        if (available) load();
      }, [available, load]);

      React.useEffect(() => {
        if (globalThis.__MEC_TRACE === true) console.log('[mec] settle-check', { preview, currentStopIndex });
        if (preview !== null && currentStopIndex === preview) setPreview(null);
      }, [preview, currentStopIndex]);

      // Flash the token caveat the moment the slider lands on the top tier,
      // then reveal the ordinary card. Only the rising edge fires, so opening
      // the card while already at the top tier stays quiet.
      const enteredTopRef = React.useRef(false);
      React.useEffect(() => {
        if (!isTop) {
          enteredTopRef.current = false;
          setSplash(false);
          return undefined;
        }
        // Wait for the drag to release before swapping the pane: replacing the
        // slider while the pointer is still down drops its release event.
        if (globalThis.__MEC_TRACE === true) console.log('[mec] splash-effect', { isTop, preview, entered: enteredTopRef.current });
        if (enteredTopRef.current || preview !== null) return undefined;
        enteredTopRef.current = true;
        if (globalThis.__MEC_TRACE === true) console.log('[mec] splash-arm', { reduced: typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches });
        if (typeof window.matchMedia === 'function'
          && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
        setSplash(true);
        if (globalThis.__MEC_TRACE === true) console.log('[mec] splash-set', true);
        const timer = setTimeout(() => { setSplash(false); }, 3000);
        return () => { clearTimeout(timer); };
      }, [isTop, preview]);

      React.useEffect(() => {
        if (locked && open) close();
      }, [locked, open]);

      React.useEffect(() => {
        if (!open) return undefined;
        const onDown = (event) => {
          if (rootRef.current?.contains(event.target) === true) return;
          if (cardRef.current?.contains(event.target) === true) return;
          close();
        };
        const onKey = (event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          close(true);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
          document.removeEventListener('mousedown', onDown);
          document.removeEventListener('keydown', onKey);
        };
      }, [open]);

      React.useLayoutEffect(() => {
        if (!open) {
          setPos(null);
          return undefined;
        }
        const place = () => {
          const trigger = triggerRef.current;
          if (trigger === null) return;
          const rect = trigger.getBoundingClientRect();
          const card = cardRef.current;
          const width = card?.offsetWidth ?? 0;
          const height = card?.offsetHeight ?? 0;
          let left = rect.right - width;
          let top = rect.top - GAP - height;
          if (width > 0) left = Math.min(Math.max(left, MARGIN), window.innerWidth - width - MARGIN);
          if (height > 0) top = Math.min(Math.max(top, MARGIN), window.innerHeight - height - MARGIN);
          setPos({ left, top });
        };
        place();
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        const card = cardRef.current;
        const observer = typeof ResizeObserver === 'undefined' || card === null
          ? null
          : new ResizeObserver(place);
        observer?.observe(card);
        return () => {
          observer?.disconnect();
          window.removeEventListener('scroll', place, true);
          window.removeEventListener('resize', place);
        };
      }, [open, pane, state, preview, error]);

      const onFocusOut = (event) => {
        const next = event.relatedTarget;
        if (next instanceof Node
          && (rootRef.current?.contains(next) === true || cardRef.current?.contains(next) === true)) return;
        if (open) close();
      };

      const commit = (nextIndex, source) => {
        const stop = stops[nextIndex];
        if (stop === undefined) {
          setPreview(null);
          return;
        }
        if (state.current === null || state.current === undefined) {
          setPreview(null);
          return;
        }
        if (stop.effort === effectiveEffort) {
          setPreview(null);
          return;
        }
        if (inflightRef.current === stop.effort) return;
        inflightRef.current = stop.effort;
        setError(null);
        const now = Date.now();
        const tooSoon = now - lastCommitAtRef.current < 250;
        lastCommitAtRef.current = now;
        trace('commit', JSON.stringify({
          source,
          sent: { provider: state.current.provider, model: state.current.model, effort: stop.effort ?? null },
          current: state.current.reasoningEffort ?? null,
          index: nextIndex,
          tooSoon,
        }));
        if (tooSoon && source !== 'pointerup') return;
        const selection = { provider: state.current.provider, model: state.current.model };
        if (stop.effort !== undefined) selection.reasoningEffort = stop.effort;
        Promise.resolve(select(selection)).then((result) => {
          inflightRef.current = null;
          trace('commit-done', JSON.stringify({
            ok: result === undefined ? 'noop' : result.ok,
            error: result !== undefined && result.ok === false ? result.error?.message ?? '' : '',
            current: directory.getSnapshot().current,
            pending: directory.getSnapshot().pending,
            status: directory.getSnapshot().status,
          }));
          if (result !== undefined && result.ok === false) {
            setError(result.error?.message ?? t('error.fallback'));
            setPreview(null);
          }
        }, (failure) => {
          inflightRef.current = null;
          setError(failure?.message ?? String(failure));
          setPreview(null);
        });
      };

      commitRef.current = commit;

      // A drag can end anywhere; commit the previewed value on release instead
      // of relying on the input receiving pointerup. Without this a fast drag
      // to the last stop looked applied while the session stayed on the old
      // level — reopening the card "jumped back".
      React.useEffect(() => {
        if (preview === null) return undefined;
        const flush = () => {
          if (previewRef.current !== null) commitRef.current?.(previewRef.current, 'release');
        };
        window.addEventListener('pointerup', flush, true);
        window.addEventListener('pointercancel', flush, true);
        window.addEventListener('mouseup', flush, true);
        return () => {
          window.removeEventListener('pointerup', flush, true);
          window.removeEventListener('pointercancel', flush, true);
          window.removeEventListener('mouseup', flush, true);
        };
      }, [preview]);

      const chooseModel = (group, model) => {
        const isCurrent = state.current !== null
          && state.current !== undefined
          && state.current.provider === group.id
          && state.current.model === model.id;
        if (isCurrent) {
          setPreview(null);
          setPane('effort');
          return;
        }
        setError(null);
        const selection = { provider: group.id, model: model.id };
        if (model.reasoning?.defaultEffort !== undefined) {
          selection.reasoningEffort = model.reasoning.defaultEffort;
        }
        Promise.resolve(select(selection)).then((result) => {
          if (result !== undefined && result.ok === false) {
            setError(result.error?.message ?? t('error.fallback'));
            return;
          }
          setPreview(null);
          setPane('effort');
        }, (failure) => {
          setError(failure?.message ?? String(failure));
        });
      };

      if (!available) return null;

      try {
      const ratio = stops.length > 1 ? displayIndex / (stops.length - 1) : 0;
      const fill = travel(ratio);
      const track = trackGradient(tier.gradient, ratio);

      const slider = stops.length > 1
        ? h('div', { className: 'mec-slider', style: { '--mec-fill': fill, '--mec-track': track } },
          h('input', {
            type: 'range',
            className: isTop ? 'mec-range mec-range-top' : 'mec-range',
            min: 0,
            max: stops.length - 1,
            step: 1,
            value: displayIndex,
            'aria-label': t('dialog.aria'),
            'aria-valuetext': stops[displayIndex]?.label,
            disabled: busy || locked,
            onInput: (event) => { setPreview(Number(event.currentTarget.value)); },
            onKeyDown: (event) => {
              // 1..4 jump straight to a tier; the arrows only step one at a time.
              if (event.altKey || event.ctrlKey || event.metaKey) return;
              const digit = Number(event.key);
              if (!Number.isInteger(digit) || digit < 1 || digit > stops.length) return;
              event.preventDefault();
              commit(digit - 1, 'digit');
            },
            onKeyUp: (event) => {
              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
                commit(Number(event.currentTarget.value), 'keyup');
              }
            },
            onBlur: (event) => {
              if (preview !== null) commit(Number(event.currentTarget.value), 'blur');
            },
          }),
          h('div', { className: 'mec-dots', 'aria-hidden': true },
            stops.map((stop, index) => h('span', {
              key: stop.key,
              className: [
                index <= displayIndex ? 'mec-dot mec-dot-on' : 'mec-dot',
                isTop ? 'mec-dot-spark' : '',
              ].filter(Boolean).join(' '),
              style: {
                left: travel(stops.length > 1 ? index / (stops.length - 1) : 0),
                ...(isTop ? { animationDelay: `${(index * 0.16).toFixed(2)}s` } : {}),
              },
            }))),
          isTop ? h('span', { className: 'mec-sheen', 'aria-hidden': true }) : null)
        : null;

      const errorStrip = error === null
        ? null
        : h('div', { className: 'mec-error', role: 'status' },
          h('span', { className: 'mec-error-text' }, `${t('error.prefix')} · ${error}`));

      const effortBody = h('div', { key: 'effort', className: 'mec-main' },
        h('div', { className: 'mec-head-row' },
          h('span', {
            className: isTop ? 'mec-bolt mec-bolt-top' : 'mec-bolt',
            'aria-hidden': true,
            style: { color: tier.color },
          }, boltGlyph()),
          h('span', { className: 'mec-tier-title', style: { color: tier.color } }, tierName),
          isTop && tierLatin !== undefined
            ? h('span', { className: 'mec-badge' }, t('max.badge'))
            : tierLatin === undefined ? null : h('span', { className: 'mec-tier-latin' }, tierLatin)),
        currentChoice === undefined
          ? null
          : h('button', {
            type: 'button',
            className: 'mec-model',
            onClick: () => { setPane('model'); },
          },
          h('span', { className: 'mec-model-name' }, currentChoice.model.name),
          chevron('mec-chevron', 'right')),
        slider,
        errorStrip,
        loading ? h('div', { className: 'mec-status' }, t('status.loading')) : null);

      const modelPane = h('div', { className: 'mec-main mec-main-list' },
        h('div', { className: 'mec-head' },
          h('button', {
            type: 'button',
            className: 'mec-back',
            'aria-label': t('pane.back'),
            onClick: () => { setPane('effort'); },
          }, chevron('mec-back-icon', 'left')),
          h('span', { className: 'mec-head-title' }, t('pane.model'))),
        groups.length === 0
          ? h('div', { className: 'mec-status' }, loading ? t('status.loading') : t('status.empty'))
          : h('div', { className: 'mec-list' },
            groups.map((group) => h('div', { key: group.id },
              groups.length > 1 ? h('div', { className: 'mec-group' }, group.name) : null,
              group.models.map((model) => {
                const isCurrent = state.current !== null
                  && state.current !== undefined
                  && state.current.provider === group.id
                  && state.current.model === model.id;
                return h('button', {
                  key: model.id,
                  type: 'button',
                  className: 'mec-opt',
                  'aria-current': isCurrent ? 'true' : undefined,
                  onClick: () => { chooseModel(group, model); },
                },
                h('span', { className: 'mec-opt-name', title: model.name }, model.name),
                isCurrent ? checkGlyph() : null);
              })))),
        errorStrip);

      // The illustration stays put for every state of the right column: the
      // slider, the model list, and the top-tier splash all swap into the same
      // slot so the artwork never blinks out and back in.
      // Landing on the top tier is announced first and alone: the whole card
      // turns into one line of copy, then the illustration and controls come
      // back. Rendering the artwork underneath first is what felt off.
      const splashView = h('div', { key: 'splash', className: 'mec-splash', role: 'note' },
        t('max.splash'));

      const layout = splash && pane === 'effort'
        ? splashView
        : h('div', { className: 'mec-layout' },
          tierImage === undefined
            ? null
            : h('div', { className: 'mec-hero' },
              h('img', {
                key: tierImage,
                className: 'mec-hero-img',
                src: `/model-effort/asset/${tierImage}`,
                alt: '',
                draggable: false,
              })),
          pane === 'model' ? modelPane : effortBody);

      const card = h(CardBoundary, null,
        h('div', {
          ref: cardRef,
          className: isTop ? 'mec-card mec-card-ultra' : 'mec-card',
          role: 'dialog',
          'aria-label': t('dialog.aria'),
          style: pos === null ? MEASURE_STYLE : { left: `${pos.left}px`, top: `${pos.top}px` },
          onBlur: onFocusOut,
          // Keep focus on the trigger for every non-slider press: pressing a
          // plain div would otherwise blur to <body> and the focus-out handler
          // would close the card the user just clicked into.
          onMouseDown: (event) => {
            if (event.target instanceof Element && event.target.closest('.mec-range') === null) {
              event.preventDefault();
            }
          },
        }, layout));

      return h('div', { ref: rootRef, className: 'mec-root', onBlur: onFocusOut },
        h('button', {
          ref: triggerRef,
          type: 'button',
          className: 'mec-trigger',
          'aria-label': triggerAria,
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          'aria-busy': busy,
          title: triggerLabel,
          disabled: locked,
          onClick: () => { if (open) close(true); else show(); },
        },
        modelsGlyph(),
        h('span', { className: 'mec-trigger-label' }, modelLabel),
        effortLabel === undefined ? null : h('span', { className: 'mec-trigger-effort' }, effortLabel),
        busy ? spinnerGlyph() : chevron(open ? 'mec-chevron mec-chevron-open' : 'mec-chevron', 'down')),
        open ? createPortal(card, document.body) : null);
      } catch (failure) {
        // Rethrow so the slot supervisor abdicates this entry and the shipped
        // control takes the cell back; the report is what makes it diagnosable.
        report('body', failure);
        throw failure;
      }
    }

    /* ── plugin body ────────────────────────────────────────────────────── */

    function apply(ctx) {
      try {
        ctx.effect(() => injectStyle());
        ctx.effect(() => ctx.locale.register(NS, DICT));
      } catch (failure) {
        report('apply', failure);
        throw failure;
      }
      const t = ctx.locale.bind(NS);
      trace('apply', 'client half applied');

      ctx.inject(['slots', 'modelDirectories', 'sessions'], (scope) => {
        const models = scope.modelDirectories;
        const sessions = scope.sessions;
        try {
          scope.slots.inject('conversation.input.model', () => scope.slots.register({
            name: 'conversation.input.model',
            priority: -1,
            inject: (sessionId) => {
              try {
                const directory = models.directoryFor(sessionId);
                const available = sessions.subagentAddress(sessionId) === undefined;
                return {
                  available,
                  directory: directory.store,
                  load: () => {
                    if (!available) return;
                    Promise.resolve(directory.load()).catch(() => {});
                  },
                  select: (selection) => (available
                    ? directory.select(selection)
                    : Promise.resolve(undefined)),
                  t,
                };
              } catch (failure) {
                report('inject', failure);
                throw failure;
              }
            },
          }, ModelEffortCard));
        } catch (failure) {
          report('register', failure);
          throw failure;
        }
      });
    }

    // `remote` and `remote.session` are required by ModelDirectoryResolver.directoryFor,
    // which reads them from the CALLER's context (`this.ctx.remote.session`) when it
    // builds a session's directory. Without these two, our earlier-than-shipped seat
    // constructs the directory first and the guarded ctx proxy throws
    // "cannot get property remote.session without inject". The shipped seat declares
    // the same two for the same reason.
    return { inject: ['slots', 'locale', 'remote', 'remote.session'], apply };
  },
});
