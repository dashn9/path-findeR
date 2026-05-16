// History screen — table of recent parser manifests.

function HistoryScreen({ parsers, onOpen }) {
  return (
    <div className="pf-screen">
      <header className="pf-screen-h">
        <div>
          <div className="pf-eyebrow">Recent parsers</div>
          <h1 className="pf-h1">History</h1>
        </div>
        <div className="pf-mono pf-fg-3">{parsers.length} parsers</div>
      </header>

      <div className="pf-table">
        <div className="pf-thead pf-mono">
          <div>status</div>
          <div>parser_id</div>
          <div>host</div>
          <div>pattern</div>
          <div className="pf-r">labels</div>
          <div className="pf-r">unresolved</div>
          <div className="pf-r">created</div>
          <div></div>
        </div>
        {parsers.map(p => {
          const labelCount = p.parser ? Object.keys(p.parser).length : 0;
          const unresolved = p.parser ? Object.values(p.parser).filter(v => v.unresolved).length : 0;
          return (
            <button key={p._id} className="pf-trow" onClick={() => onOpen(p._id)}>
              <div><StatusPill status={p.status} stage={p.stage} failStage={p.fail_stage} compact/></div>
              <div className="pf-mono pf-fg-1">{p._id}</div>
              <div className="pf-mono pf-fg-1 pf-trunc">{p.url_pattern?.host}</div>
              <div className="pf-mono pf-fg-2 pf-trunc">{p.url_pattern?.pattern}</div>
              <div className="pf-r pf-mono">{labelCount || '—'}</div>
              <div className={`pf-r pf-mono${unresolved > 0 ? ' pf-fg-warn' : ' pf-fg-3'}`}>{unresolved || '0'}</div>
              <div className="pf-r pf-mono pf-fg-2">{relTime(p.created_at)}</div>
              <div className="pf-r"><Icon name="chevron" size={14} color="#8A867C"/></div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { HistoryScreen });
