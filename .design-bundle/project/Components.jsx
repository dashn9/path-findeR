// Shared atoms: Button, Pill, SelectorChip, Tag, Input, etc.
// All components export to window for cross-file access.

const { useState, useEffect, useRef } = React;

// ─── Icon ─────────────────────────────────────────────────────
// Tiny Lucide-style stroke icons by name.
const ICON_PATHS = {
  'play':       <polygon points="5 3 19 12 5 21 5 3"/>,
  'refresh':    <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>,
  'copy':       <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
  'check':      <polyline points="20 6 9 17 4 12"/>,
  'x':          <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  'chevron':    <polyline points="9 18 15 12 9 6"/>,
  'chevron-d':  <polyline points="6 9 12 15 18 9"/>,
  'terminal':   <><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></>,
  'code':       <><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></>,
  'link':       <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.71"/></>,
  'file':       <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
  'clock':      <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
  'alert':      <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  'settings':   <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  'plus':       <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
  'circle-dot': <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1" fill="currentColor"/></>,
  'activity':   <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>,
  'list':       <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
  'inbox':      <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>,
  'arrow-r':    <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
};

function Icon({ name, size = 16, color = 'currentColor', strokeWidth = 1.5, style }) {
  const path = ICON_PATHS[name];
  if (!path) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ flex: 'none', ...style }}>
      {path}
    </svg>
  );
}

// ─── Button ───────────────────────────────────────────────────
function Button({ variant = 'secondary', size = 'md', icon, children, onClick, type = 'button', disabled, style }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`pf-btn pf-btn-${variant} pf-btn-${size}`}
      style={style}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 13 : 14} />}
      {children && <span>{children}</span>}
    </button>
  );
}

// ─── Pipeline status pill (the headline status component) ─────
// Four stages: feed · analyze · label · emit.
// stage = number of completed stages (0-4); failStage = which stage broke (1-4).
// If stage/failStage aren't supplied, sensible defaults are derived from status.
function StatusPill({ status, stage, failStage, compact }) {
  // Defaults per status
  const s = status || 'pending';
  let filled = stage;
  let fail = failStage;
  if (filled == null) {
    if (s === 'pending') filled = 0;
    else if (s === 'running') filled = 1;        // 1 done, 2nd active
    else if (s === 'done')    filled = 4;
    else if (s === 'failed')  { filled = 2; if (fail == null) fail = 3; }
  }
  return (
    <span className={`pf-pill pf-pill-t-${s}${compact ? ' pf-pill-compact' : ''}`}>
      <span className="pf-pill-stages">
        {[0,1,2,3].map(i => {
          let cls = 'pf-pill-stage';
          if (fail != null && i === fail - 1) cls += ' pf-pill-stage-fail';
          else if (i < filled) cls += ' pf-pill-stage-on';
          else if (s === 'running' && i === filled) cls += ' pf-pill-stage-cur';
          return <i key={i} className={cls} title={['feed','analyze','label','emit'][i]}/>;
        })}
      </span>
      <span className="pf-pill-name">{s}</span>
    </span>
  );
}

function TypeTag({ children }) {
  return <span className="pf-tag pf-tag-type">{children}</span>;
}
function Flag({ tone = 'neutral', children }) {
  return <span className={`pf-tag pf-tag-${tone}`}>{children}</span>;
}

// ─── Selector chip (the headline component of the product) ────
function SelectorChip({ css, onCopy }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard?.writeText(css);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
    if (onCopy) onCopy(css);
  };
  return (
    <div className="pf-sel-row">
      <code className="pf-sel">{css}</code>
      <button className="pf-sel-copy" onClick={handleCopy} title="Copy selector">
        {copied ? <Icon name="check" size={13} color="#2F7A4A"/> : <Icon name="copy" size={13}/>}
        <span>{copied ? 'copied' : 'copy'}</span>
      </button>
    </div>
  );
}

// ─── Input / Textarea ─────────────────────────────────────────
function Field({ label, hint, children, full }) {
  return (
    <div className={`pf-field${full ? ' pf-field-full' : ''}`}>
      {label && <label className="pf-label">{label}</label>}
      {children}
      {hint && <div className="pf-hint">{hint}</div>}
    </div>
  );
}
function Input({ mono, ...rest }) {
  return <input className={`pf-input${mono ? ' pf-mono' : ''}`} {...rest}/>;
}
function Textarea({ mono, rows = 6, ...rest }) {
  return <textarea className={`pf-input${mono ? ' pf-mono' : ''}`} rows={rows} {...rest}/>;
}
function Checkbox({ checked, onChange, label, id }) {
  const _id = id || `cb-${Math.random().toString(36).slice(2,8)}`;
  return (
    <label className="pf-check" htmlFor={_id}>
      <input id={_id} type="checkbox" checked={checked} onChange={onChange}/>
      <span>{label}</span>
    </label>
  );
}

// ─── Toast ────────────────────────────────────────────────────
function Toast({ kind = 'info', title, body, onDismiss }) {
  const kinds = {
    success: { ic: 'check',  c: '#2F7A4A' },
    error:   { ic: 'alert',  c: '#B83A2C' },
    info:    { ic: 'circle-dot', c: '#2952E0' },
  };
  const k = kinds[kind] || kinds.info;
  return (
    <div className={`pf-toast pf-toast-${kind}`}>
      <Icon name={k.ic} size={16} color={k.c}/>
      <div className="pf-toast-body">
        {title && <div className="pf-toast-title">{title}</div>}
        {body && <div className="pf-toast-text">{body}</div>}
      </div>
      <button className="pf-toast-x" onClick={onDismiss}><Icon name="x" size={13}/></button>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="pf-modal-scrim" onClick={onClose}>
      <div className="pf-modal" onClick={e => e.stopPropagation()}>
        <header className="pf-modal-h">
          <div className="pf-modal-title">{title}</div>
          <button className="pf-modal-x" onClick={onClose}><Icon name="x" size={14}/></button>
        </header>
        <div className="pf-modal-body">{children}</div>
        {footer && <footer className="pf-modal-f">{footer}</footer>}
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────
function Tabs({ tabs, active, onChange }) {
  return (
    <div className="pf-tabs">
      {tabs.map(t => (
        <button
          key={t.id}
          className={`pf-tab${t.id === active ? ' pf-tab-on' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.badge != null && <span className="pf-tab-badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

// ─── Segmented ────────────────────────────────────────────────
function Segmented({ options, value, onChange }) {
  return (
    <div className="pf-seg">
      {options.map(o => (
        <button key={o.value}
          className={o.value === value ? 'pf-seg-on' : ''}
          onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── JSON syntax highlight ────────────────────────────────────
function syntaxHighlight(obj) {
  const json = JSON.stringify(obj, null, 2);
  return json
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
      let cls = 'pf-json-num';
      if (/^"/.test(match)) cls = /:$/.test(match) ? 'pf-json-key' : 'pf-json-str';
      else if (/true|false/.test(match)) cls = 'pf-json-bool';
      else if (/null/.test(match)) cls = 'pf-json-null';
      return `<span class="${cls}">${match}</span>`;
    });
}

function JsonBlock({ data, filename }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(data, null, 2);
  const handleCopy = () => {
    navigator.clipboard?.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="pf-json-wrap">
      <div className="pf-json-head">
        <span className="pf-json-filename">{filename || 'manifest.json'}</span>
        <button className="pf-json-copy" onClick={handleCopy}>
          <Icon name={copied ? 'check' : 'copy'} size={12}/>
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre className="pf-json-pre" dangerouslySetInnerHTML={{ __html: syntaxHighlight(data) }}/>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────
function EmptyState({ title, body, cta }) {
  return (
    <div className="pf-empty">
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {cta}
    </div>
  );
}

// ─── time helpers ─────────────────────────────────────────────
function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: '2-digit' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function relTime(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return Math.floor(diff) + 's ago';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  return Math.floor(diff/86400) + 'd ago';
}

Object.assign(window, {
  Icon, Button, StatusPill, TypeTag, Flag, SelectorChip,
  Field, Input, Textarea, Checkbox, Toast, Modal,
  Tabs, Segmented, JsonBlock, EmptyState, fmtTime, relTime,
});
