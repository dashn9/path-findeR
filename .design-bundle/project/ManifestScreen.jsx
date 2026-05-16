// Manifest screen: header (URL pattern + meta), tabs for tree / raw / test, regenerate modal.

function ManifestScreen({ parser, onRegenerate, onNavigate }) {
  const [tab, setTab] = useState('inspect');
  const [regenOpen, setRegenOpen] = useState(false);
  if (!parser) return null;

  const labelEntries = parser.parser ? Object.entries(parser.parser) : [];
  const unresolvedCount = labelEntries.filter(([, v]) => v.unresolved).length;

  return (
    <div className="pf-screen">
      <header className="pf-screen-h">
        <div>
          <div className="pf-eyebrow">GET /parser/{parser._id}</div>
          <div className="pf-row" style={{gap: 12, alignItems: 'baseline'}}>
            <h1 className="pf-h1 pf-mono">{parser.url_pattern?.host || '—'}</h1>
            <span className="pf-h1-sub pf-mono">{parser.url_pattern?.pattern}</span>
          </div>
        </div>
        <div className="pf-row" style={{gap: 8}}>
          <Button size="sm" icon="refresh" onClick={() => setRegenOpen(true)}>Regenerate</Button>
        </div>
      </header>

      <div className="pf-meta-strip pf-mono">
        <span><StatusPill status={parser.status} stage={parser.stage} failStage={parser.fail_stage}/></span>
        <span className="pf-meta-sep">·</span>
        <span>parser_id <span className="pf-fg-1">{parser._id}</span></span>
        <span className="pf-meta-sep">·</span>
        <span>{labelEntries.length} labels</span>
        {unresolvedCount > 0 && (
          <>
            <span className="pf-meta-sep">·</span>
            <span className="pf-fg-warn">{unresolvedCount} unresolved</span>
          </>
        )}
        <span className="pf-meta-sep">·</span>
        <span>created {fmtTime(parser.created_at)}</span>
        {parser.completed_at && (
          <>
            <span className="pf-meta-sep">·</span>
            <span>completed {fmtTime(parser.completed_at)}</span>
          </>
        )}
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'tree',    label: 'Manifest', badge: labelEntries.length },
          { id: 'inspect', label: 'Inspector', badge: unresolvedCount > 0 ? unresolvedCount + '!' : null },
          { id: 'test',    label: 'Test selectors' },
          { id: 'raw',     label: 'Raw JSON' },
        ]}
      />

      <div className="pf-tab-body">
        {tab === 'tree'    && <ManifestTree parser={parser}/>}
        {tab === 'inspect' && <RunInspector parser={parser}/>}
        {tab === 'raw'     && <JsonBlock data={parser} filename={`parser-${parser._id}.json`}/>}
        {tab === 'test'    && <SelectorTester parser={parser}/>}
      </div>

      <RegenerateModal
        open={regenOpen}
        parser={parser}
        onClose={() => setRegenOpen(false)}
        onConfirm={(opts) => { setRegenOpen(false); onRegenerate(parser._id, opts); }}
      />
    </div>
  );
}

// ─── Tree view (the headline UI) ──────────────────────────────
function ManifestTree({ parser }) {
  if (!parser.parser) {
    return <EmptyState title="Manifest not ready" body="Pipeline is still running."/>;
  }
  return (
    <div className="pf-tree">
      <div className="pf-tree-meta">
        <div>
          <div className="pf-eyebrow">URL pattern</div>
          <div className="pf-mono pf-tree-pattern">
            <span className="pf-fg-1">{parser.url_pattern.host}</span><span className="pf-fg-3">{parser.url_pattern.pattern}</span>
          </div>
        </div>
        <div className="pf-tree-meta-r pf-mono">{parser.pages_seen || 0} pages in corpus</div>
      </div>

      <div className="pf-labels">
        {Object.entries(parser.parser).map(([label, def]) => (
          <LabelGroup key={label} name={label} def={def}/>
        ))}
      </div>
    </div>
  );
}

function LabelGroup({ name, def }) {
  return (
    <section className={`pf-label-grp${def.unresolved ? ' pf-label-grp-unresolved' : ''}`}>
      <header className="pf-label-h">
        <div className="pf-label-name-wrap">
          <h3 className="pf-label-name">{name}</h3>
          <div className="pf-label-tags">
            {def.concrete_types?.map(t => <TypeTag key={t}>{t}</TypeTag>)}
            {def.abstract_types?.map(t => <Flag key={t} tone="neutral">{t}</Flag>)}
            {def.array && <Flag tone="accent">array</Flag>}
            {def.unresolved && <Flag tone="warning">unresolved</Flag>}
          </div>
        </div>
        <div className="pf-label-h-r pf-mono">
          {def.selectors.length} {def.selectors.length === 1 ? 'selector' : 'selectors'}
        </div>
      </header>
      <div className="pf-label-selectors">
        {def.selectors.map((s, i) => (
          <SelectorChip key={i} css={s.css}/>
        ))}
      </div>
      {def.unresolved && (
        <div className="pf-label-warn pf-mono">
          <Icon name="alert" size={13} color="#C97A1A"/>
          Validation failed across the corpus. Regenerate or feed more pages.
        </div>
      )}
    </section>
  );
}

// ─── Selector tester (browser-side validation) ────────────────
function SelectorTester({ parser }) {
  const [html, setHtml] = useState(window.SAMPLE_HTML);
  const [results, setResults] = useState(null);

  const run = () => {
    if (!parser.parser) return;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = {};
    for (const [label, def] of Object.entries(parser.parser)) {
      let matched = null;
      for (const sel of def.selectors) {
        try {
          const nodes = def.array ? doc.querySelectorAll(sel.css) : [doc.querySelector(sel.css)].filter(Boolean);
          if (nodes.length > 0) {
            matched = {
              selector: sel.css,
              values: [...nodes].slice(0, 3).map(n =>
                n.tagName === 'IMG' ? (n.getAttribute('src') || '') : (n.textContent?.trim() || '')
              ),
              count: nodes.length,
            };
            break;
          }
        } catch (e) { /* invalid selector */ }
      }
      out[label] = matched;
    }
    setResults(out);
  };

  const reset = () => { setHtml(''); setResults(null); };

  return (
    <div className="pf-tester">
      <div className="pf-tester-l">
        <Field label="paste html" hint="document.querySelector(All) runs against this in your browser.">
          <Textarea mono rows={18} value={html} onChange={e => setHtml(e.target.value)}/>
        </Field>
        <div className="pf-row-end">
          <Button variant="ghost" onClick={reset}>Clear</Button>
          <Button variant="primary" icon="play" onClick={run}>Run selectors</Button>
        </div>
      </div>
      <div className="pf-tester-r">
        <div className="pf-eyebrow">Results</div>
        {!results && <div className="pf-tester-prompt pf-mono">Run to see what each selector extracts.</div>}
        {results && Object.entries(results).map(([label, m]) => (
          <div key={label} className={`pf-tester-row${!m ? ' pf-tester-row-miss' : ''}`}>
            <div className="pf-tester-row-h">
              <span className="pf-tester-label">{label}</span>
              {m
                ? <span className="pf-mono pf-fg-ok">✓ {m.count} {m.count === 1 ? 'match' : 'matches'}</span>
                : <span className="pf-mono pf-fg-err">✗ 0 matches</span>}
            </div>
            {m && (
              <>
                <code className="pf-tester-sel">{m.selector}</code>
                <div className="pf-tester-vals">
                  {m.values.map((v, i) => (
                    <div key={i} className="pf-tester-val pf-mono">{v || <em>(empty)</em>}</div>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Regenerate modal ─────────────────────────────────────────
function RegenerateModal({ open, parser, onClose, onConfirm }) {
  const allLabels = parser?.parser ? Object.keys(parser.parser) : [];
  const [selected, setSelected] = useState(new Set());
  const [force, setForce] = useState(false);

  useEffect(() => {
    if (open) setSelected(new Set(allLabels.filter(l => parser.parser[l].unresolved)));
  }, [open, parser]);

  const toggle = (label) => {
    const next = new Set(selected);
    next.has(label) ? next.delete(label) : next.add(label);
    setSelected(next);
  };
  const toggleAll = () => {
    setSelected(selected.size === allLabels.length ? new Set() : new Set(allLabels));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span>Regenerate <span className="pf-mono pf-fg-2">parser_id {parser?._id}</span></span>}
      footer={
        <>
          <span className="pf-mono pf-fg-3">
            {selected.size === 0 || selected.size === allLabels.length
              ? 'all labels'
              : `${selected.size} of ${allLabels.length} labels`}
            {force && ' · force'}
          </span>
          <div className="pf-row" style={{gap: 8}}>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" icon="refresh"
              onClick={() => onConfirm({ labels: [...selected], force })}>
              Regenerate
            </Button>
          </div>
        </>
      }
    >
      <p className="pf-body" style={{marginTop: 0}}>
        Selectors for the labels below will be re-derived from the corpus. Existing values are replaced when the run completes.
      </p>
      <div className="pf-modal-section">
        <div className="pf-row" style={{justifyContent: 'space-between', marginBottom: 8}}>
          <span className="pf-eyebrow">Labels</span>
          <button className="pf-link" onClick={toggleAll}>
            {selected.size === allLabels.length ? 'clear' : 'select all'}
          </button>
        </div>
        <div className="pf-checklist">
          {allLabels.map(l => (
            <label key={l} className="pf-checklist-row">
              <input type="checkbox" checked={selected.has(l)} onChange={() => toggle(l)}/>
              <span className="pf-mono">{l}</span>
              {parser.parser[l].unresolved && <Flag tone="warning">unresolved</Flag>}
            </label>
          ))}
        </div>
      </div>
      <Checkbox checked={force} onChange={e => setForce(e.target.checked)}
        label="force = true  (skip the 'newer pages exist' check)"/>
    </Modal>
  );
}

Object.assign(window, { ManifestScreen });
