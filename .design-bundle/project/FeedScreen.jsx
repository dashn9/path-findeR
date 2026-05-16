// Feed screen — paste URL + HTML, assign or reuse job_id, watch queue + status.

function FeedScreen({ feedQueue, onFeed, onForce, onNavigate, activeJobId }) {
  const [jobId, setJobId] = useState(activeJobId || '');
  const [url, setUrl] = useState('');
  const [html, setHtml] = useState('');
  const [forceOnSubmit, setForceOnSubmit] = useState(false);

  useEffect(() => { if (activeJobId) setJobId(activeJobId); }, [activeJobId]);

  const genJobId = () => {
    const id = Math.random().toString(16).slice(2, 8);
    setJobId(id);
  };
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url || !html) return;
    const id = jobId || Math.random().toString(16).slice(2, 8);
    setJobId(id);
    onFeed({ job_id: id, url, html });
    setUrl(''); setHtml('');
    if (forceOnSubmit) onForce(id);
  };

  const pages = feedQueue.filter(p => p.job_id === (jobId || activeJobId));
  const job = window.MOCK_PARSERS.find(p => p._id === (jobId || activeJobId));

  return (
    <div className="pf-screen">
      <header className="pf-screen-h">
        <div>
          <div className="pf-eyebrow">POST /feed</div>
          <h1 className="pf-h1">Feed pages</h1>
        </div>
        <div className="pf-screen-h-meta pf-mono">
          min_pages = {window.MOCK_CONFIG.min_pages}
        </div>
      </header>

      <div className="pf-grid-2">
        <section className="pf-card">
          <form onSubmit={handleSubmit} className="pf-form">
            <div className="pf-form-row">
              <Field label="job_id" hint={<>Reuse an existing id, or <button type="button" className="pf-link" onClick={genJobId}>generate one</button>.</>}>
                <Input mono value={jobId} onChange={e => setJobId(e.target.value)} placeholder="a3f9c1"/>
              </Field>
              <Field label="url">
                <Input mono value={url} onChange={e => setUrl(e.target.value)} placeholder="https://shop.example.com/products/87423"/>
              </Field>
            </div>
            <Field label="html" hint="Raw HTML up to max_direct_kb (300kb). Larger payloads are streamed.">
              <Textarea mono rows={9} value={html} onChange={e => setHtml(e.target.value)}
                placeholder="<!DOCTYPE html>&#10;<html>...</html>"/>
            </Field>
            <div className="pf-form-foot">
              <Checkbox checked={forceOnSubmit} onChange={e => setForceOnSubmit(e.target.checked)}
                label="Force run if minimum reached"/>
              <div className="pf-row-end">
                <Button variant="ghost" onClick={() => { setUrl(''); setHtml(''); }}>Discard</Button>
                <Button variant="primary" icon="arrow-r" type="submit">Feed page</Button>
              </div>
            </div>
          </form>
        </section>

        <section className="pf-card">
          <header className="pf-card-h">
            <span className="pf-eyebrow">Queue · job_id {jobId || '—'}</span>
            {job && <StatusPill status={job.status} stage={job.stage} failStage={job.fail_stage} compact/>}
          </header>

          {pages.length === 0 ? (
            <div className="pf-queue-empty">
              <div className="pf-mono pf-fg-3">no pages yet</div>
              <div className="pf-caption">Feed at least {window.MOCK_CONFIG.min_pages} pages to start a job.</div>
            </div>
          ) : (
            <ol className="pf-queue">
              {pages.map((p, i) => (
                <li key={i} className="pf-queue-item">
                  <span className="pf-queue-idx pf-mono">{String(i+1).padStart(2,'0')}</span>
                  <div className="pf-queue-body">
                    <div className="pf-mono pf-fg-1 pf-trunc">{p.url}</div>
                    <div className="pf-caption pf-mono">{Math.round((p.html?.length || 0)/1024)}kb · accepted {relTime(p.at)}</div>
                  </div>
                  <Icon name="check" size={14} color="#2F7A4A"/>
                </li>
              ))}
            </ol>
          )}

          <footer className="pf-card-f">
            <div className="pf-caption">
              {pages.length}/{window.MOCK_CONFIG.min_pages} pages · {pages.length >= window.MOCK_CONFIG.min_pages ? 'ready to run' : 'minimum not reached'}
            </div>
            <div className="pf-row-end">
              <Button size="sm" onClick={() => onForce(jobId)} disabled={!jobId} icon="play">Force run</Button>
              {job && job.status === 'done' && (
                <Button size="sm" variant="primary" icon="arrow-r" onClick={() => onNavigate('parser', jobId)}>
                  Open manifest
                </Button>
              )}
            </div>
          </footer>
        </section>
      </div>

      <section className="pf-help">
        <div className="pf-eyebrow">Pipeline</div>
        <div className="pf-pipeline pf-mono">
          <span>URL pattern</span><Icon name="arrow-r" size={12}/>
          <span>HTML parse</span><Icon name="arrow-r" size={12}/>
          <span>analyze + score</span><Icon name="arrow-r" size={12}/>
          <span>LLM labels</span><Icon name="arrow-r" size={12}/>
          <span>CSS selectors</span><Icon name="arrow-r" size={12}/>
          <span>validate corpus</span>
        </div>
      </section>
    </div>
  );
}

Object.assign(window, { FeedScreen });
