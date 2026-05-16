// Run Inspector — the "show me how the engine decided" view.
// For one label: candidate selectors with scores, cross-corpus
// validation grid, DOM context with matched node highlighted in
// match-yellow, LLM rationale, extracted values. Plus a live
// activity log for the whole run.

function RunInspector({ parser }) {
  const trace = window.MOCK_TRACES[parser._id];
  const allLabels = parser.parser ? Object.keys(parser.parser) : [];
  const [activeLabel, setActiveLabel] = useState(allLabels[0] || null);
  const [activeCand, setActiveCand] = useState(0);
  const [pageIdx, setPageIdx] = useState(0);

  // When switching label, reset candidate to the chosen one
  useEffect(() => {
    if (!trace || !activeLabel) return;
    const lab = trace.labels[activeLabel];
    if (lab) setActiveCand(lab.chosen >= 0 ? lab.chosen : 0);
  }, [activeLabel]);

  if (!trace) {
    return <EmptyState title="No run trace recorded"
      body="Inspector requires telemetry from a completed run. Feed pages and re-run to capture."/>;
  }
  if (!activeLabel) return null;

  const lab = trace.labels[activeLabel];
  const def = parser.parser[activeLabel];

  return (
    <div className="pf-insp">
      {/* Label switcher */}
      <div className="pf-insp-labels">
        <span className="pf-eyebrow" style={{paddingRight: 6}}>Labels</span>
        {allLabels.map(l => {
          const unresolved = parser.parser[l].unresolved;
          return (
            <button key={l}
              className={`pf-insp-labtab${l === activeLabel ? ' pf-insp-labtab-on' : ''}${unresolved ? ' pf-insp-labtab-warn' : ''}`}
              onClick={() => setActiveLabel(l)}>
              <span className="pf-mono">{l}</span>
              {unresolved && <Icon name="alert" size={11} color="#C97A1A"/>}
            </button>
          );
        })}
      </div>

      {/* Header strip — label + types + chosen */}
      <header className={`pf-insp-head${lab.unresolved ? ' pf-insp-head-warn' : ''}`}>
        <div className="pf-insp-head-l">
          <div className="pf-eyebrow">label</div>
          <div className="pf-row" style={{gap: 12, alignItems: 'baseline', flexWrap: 'wrap'}}>
            <h2 className="pf-insp-name">{activeLabel}</h2>
            <div className="pf-label-tags">
              {def.concrete_types?.map(t => <TypeTag key={t}>{t}</TypeTag>)}
              {def.abstract_types?.map(t => <Flag key={t} tone="neutral">{t}</Flag>)}
              {def.array && <Flag tone="accent">array</Flag>}
              {lab.unresolved && <Flag tone="warning">unresolved</Flag>}
            </div>
          </div>
        </div>
        <div className="pf-insp-head-r">
          <div className="pf-eyebrow pf-r">chosen selector{lab.chosen < 0 ? '  · none' : ''}</div>
          {lab.chosen >= 0 ? (
            <code className="pf-insp-chosen">{lab.candidates[lab.chosen].css}</code>
          ) : (
            <code className="pf-insp-chosen pf-insp-chosen-none">— validation failed across the corpus</code>
          )}
        </div>
      </header>

      {/* Main grid: candidates + DOM + side rail */}
      <div className="pf-insp-grid">
        {/* Candidates */}
        <section className="pf-insp-card">
          <header className="pf-insp-card-h">
            <span className="pf-eyebrow">Candidate selectors · ranked by score</span>
            <span className="pf-mono pf-fg-3">top_n = {lab.candidates.length}</span>
          </header>
          <ol className="pf-cand-list">
            {lab.candidates.map((c, i) => (
              <li key={i}>
                <button className={
                  'pf-cand' +
                  (i === activeCand ? ' pf-cand-active' : '') +
                  (i === lab.chosen ? ' pf-cand-chosen' : '')
                } onClick={() => setActiveCand(i)}>
                  <span className="pf-cand-rank pf-mono">{i === lab.chosen ? '★' : String(i+1).padStart(2,'0')}</span>
                  <div className="pf-cand-score-col">
                    <div className="pf-cand-score pf-mono">{c.score.toFixed(2)}</div>
                    <div className="pf-cand-bar">
                      <div className="pf-cand-bar-fill" style={{width: `${Math.round(c.score*100)}%`, background: c.score >= 0.75 ? 'var(--ink-1)' : c.score >= 0.5 ? 'var(--ink-2)' : 'var(--ink-3)'}}/>
                    </div>
                  </div>
                  <div className="pf-cand-body">
                    <code className="pf-cand-sel">{c.css}</code>
                    <div className="pf-cand-note">{c.note}</div>
                  </div>
                </button>
              </li>
            ))}
          </ol>
        </section>

        {/* DOM context */}
        <section className="pf-insp-card pf-insp-dom-card">
          <header className="pf-insp-card-h">
            <span className="pf-eyebrow">DOM context · page {pageIdx + 1} of {trace.pages.length}</span>
            <div className="pf-row" style={{gap: 6}}>
              <button className="pf-iconbtn-sm" onClick={() => setPageIdx(i => (i - 1 + trace.pages.length) % trace.pages.length)} title="Previous page"><Icon name="chevron" size={12} style={{transform: 'rotate(180deg)'}}/></button>
              <code className="pf-mono pf-fg-2" style={{fontSize: 11}}>{trace.pages[pageIdx].short}</code>
              <button className="pf-iconbtn-sm" onClick={() => setPageIdx(i => (i + 1) % trace.pages.length)} title="Next page"><Icon name="chevron" size={12}/></button>
            </div>
          </header>
          <pre className="pf-dom">
            {lab.dom.map(line => (
              <span key={line.i} className={`pf-dom-line${line.match ? ' pf-dom-line-match' : ''}`}>
                <span className="pf-dom-ln">{String(line.i + 1).padStart(2, ' ')}</span>
                <span className="pf-dom-code" dangerouslySetInnerHTML={{__html: hlHtml(line.t)}}/>
                {line.match && <span className="pf-dom-bullet pf-mono">← match</span>}
              </span>
            ))}
          </pre>
          <footer className="pf-insp-dom-foot">
            <span className="pf-eyebrow">Extracted</span>
            <div className="pf-dom-vals">
              {lab.values.slice(0, 4).map((v, i) => (
                <code key={i} className={`pf-dom-val${v.startsWith('(') ? ' pf-dom-val-empty' : ''}`}>{v}</code>
              ))}
              {lab.values.length > 4 && <span className="pf-mono pf-fg-3">+{lab.values.length - 4} more</span>}
            </div>
          </footer>
        </section>

        {/* Side rail — validation grid + rationale */}
        <section className="pf-insp-rail">
          <div className="pf-insp-card pf-insp-card-tight">
            <header className="pf-insp-card-h">
              <span className="pf-eyebrow">Cross-corpus validation</span>
              <span className="pf-mono pf-fg-3">{trace.pages.length} pages × {lab.candidates.length} sel</span>
            </header>
            <ValidationGrid pages={trace.pages} matrix={lab.validation} activeRow={activeCand}/>
            <div className="pf-valid-legend pf-mono">
              <span><i className="pf-valid-key pf-valid-key-ok"/>match</span>
              <span><i className="pf-valid-key pf-valid-key-miss"/>miss</span>
              <span><i className="pf-valid-key pf-valid-key-active"/>active row</span>
            </div>
          </div>

          <div className="pf-insp-card pf-insp-card-tight">
            <header className="pf-insp-card-h">
              <span className="pf-eyebrow">LLM rationale</span>
              <span className="pf-mono pf-fg-3">gpt-4o-mini</span>
            </header>
            <blockquote className="pf-trace">{lab.rationale}</blockquote>
          </div>
        </section>
      </div>

      {/* Activity log */}
      <ActivityLog rows={trace.activity}/>
    </div>
  );
}

function ValidationGrid({ pages, matrix, activeRow }) {
  // matrix[selectorIdx][pageIdx] = 0/1
  return (
    <div className="pf-valid-wrap" style={{ '--n': pages.length }}>
      <div className="pf-valid-pagecols pf-mono" style={{ '--n': pages.length }}>
        <div/>
        {pages.map((p, i) => (
          <div key={i} className="pf-valid-pcol" title={p.url}>{String(i+1).padStart(2,'0')}</div>
        ))}
      </div>
      {matrix.map((row, si) => {
        const okCount = row.filter(x => x).length;
        return (
          <div key={si} className={`pf-valid-row${si === activeRow ? ' pf-valid-row-active' : ''}`} style={{ '--n': pages.length }}>
            <div className="pf-valid-label pf-mono">sel {String(si+1).padStart(2,'0')}</div>
            {row.map((v, pi) => (
              <div key={pi} className={`pf-valid-cell ${v ? 'pf-valid-cell-ok' : 'pf-valid-cell-miss'}`} title={`${pages[pi].short} · ${v ? 'matched' : 'no match'}`}/>
            ))}
            <div className="pf-valid-tally pf-mono">{okCount}/{row.length}</div>
          </div>
        );
      })}
    </div>
  );
}

function ActivityLog({ rows }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(-8);
  return (
    <section className="pf-insp-card pf-log-card">
      <header className="pf-insp-card-h">
        <span className="pf-eyebrow">Activity log</span>
        <button className="pf-link pf-mono" onClick={() => setShowAll(s => !s)}>
          {showAll ? `collapse · ${rows.length}` : `show all · ${rows.length}`}
        </button>
      </header>
      <div className="pf-log">
        {visible.map((r, i) => {
          const kindTone = r.kind.startsWith('validate/miss') ? 'pf-log-kind-warn'
            : r.kind === 'done' ? 'pf-log-kind-ok'
            : r.kind.startsWith('validate/match') ? 'pf-log-kind-ok'
            : r.kind.startsWith('emit') ? 'pf-log-kind-accent'
            : '';
          return (
            <div key={i} className="pf-log-row pf-mono">
              <span className="pf-log-time">{r.t}</span>
              <span className={`pf-log-kind ${kindTone}`}>{r.kind}</span>
              <span className="pf-log-payload">{r.payload}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Tiny HTML syntax highlighter for the DOM excerpt.
function hlHtml(line) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let s = esc(line);
  // tags & comments
  s = s.replace(/(&lt;!--.*?--&gt;)/g, '<span class="pf-dom-comment">$1</span>');
  s = s.replace(/(&lt;\/?)([a-z][a-z0-9-]*)/gi, '$1<span class="pf-dom-tag">$2</span>');
  // attrs
  s = s.replace(/([a-z\-]+)=("[^"]*")/gi,
    '<span class="pf-dom-attr">$1</span>=<span class="pf-dom-str">$2</span>');
  return s;
}

Object.assign(window, { RunInspector });
