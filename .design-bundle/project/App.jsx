// App: hash-based router, global state, mock API, toasts.

function App() {
  // Hash router: #feed | #history | #settings | #parser/<id>[?tab=raw|test]
  const [route, setRoute] = useState({ name: 'feed' });
  useEffect(() => {
    const parse = () => {
      const h = window.location.hash.replace(/^#\/?/, '') || 'parser/a3f9c1';
      const [base, ...rest] = h.split('/');
      if (base === 'parser' && rest[0]) setRoute({ name: 'parser', id: rest[0] });
      else if (['feed','history','settings'].includes(base)) setRoute({ name: base });
      else setRoute({ name: 'feed' });
    };
    parse();
    window.addEventListener('hashchange', parse);
    return () => window.removeEventListener('hashchange', parse);
  }, []);

  const navigate = (name, id) => {
    if (name === 'parser' && id) window.location.hash = `parser/${id}`;
    else window.location.hash = name;
  };

  // Persistent fake state
  const [parsers, setParsers] = useState(window.MOCK_PARSERS);
  const [feedQueue, setFeedQueue] = useState(() => {
    // seed first done parser with some queue entries for demo continuity
    return [
      { job_id: 'a3f9c1', url: 'https://shop.example.com/products/87423', html: '<html>...</html>', at: new Date(Date.now()-1000*60*3).toISOString() },
      { job_id: 'a3f9c1', url: 'https://shop.example.com/products/19022', html: '<html>...</html>', at: new Date(Date.now()-1000*60*2).toISOString() },
    ];
  });
  const [baseUrl, setBaseUrl] = useState(window.PATH_FINDER_URL_DEFAULT);
  const [config, setConfig] = useState(window.MOCK_CONFIG);

  // Toasts
  const [toasts, setToasts] = useState([]);
  const toast = (kind, title, body) => {
    const id = Math.random();
    setToasts(t => [...t, { id, kind, title, body }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500);
  };

  // Mock actions
  const handleFeed = ({ job_id, url, html }) => {
    setFeedQueue(q => [...q, { job_id, url, html, at: new Date().toISOString() }]);
    toast('success', 'Page accepted', `job_id: ${job_id}`);
    // If brand-new job, register a pending row
    setParsers(ps => {
      if (ps.find(p => p._id === job_id)) return ps;
      return [{
        _id: job_id, job_id, status: 'pending',
        created_at: new Date().toISOString(), completed_at: null, error: null,
        url_pattern: { host: new URL(url).host, pattern: '/?' }, pages_seen: 1, parser: null,
      }, ...ps];
    });
  };

  const handleForce = (jobId) => {
    if (!jobId) return;
    toast('info', 'Force run triggered', `job_id: ${jobId}`);
    setParsers(ps => ps.map(p => p._id === jobId ? { ...p, status: 'running' } : p));
    // simulate completion
    setTimeout(() => {
      setParsers(ps => ps.map(p => p._id === jobId ? { ...p, status: 'done', completed_at: new Date().toISOString() } : p));
    }, 2200);
  };

  const handleRegenerate = (parserId, { labels, force }) => {
    toast('info', 'Regeneration triggered',
      `parser_id: ${parserId}${labels.length ? ` · ${labels.length} labels` : ' · all labels'}${force ? ' · force' : ''}`);
    setParsers(ps => ps.map(p => p._id === parserId ? { ...p, status: 'running' } : p));
    setTimeout(() => {
      setParsers(ps => ps.map(p => p._id === parserId ? { ...p, status: 'done', completed_at: new Date().toISOString() } : p));
    }, 2000);
  };

  const activeParser = route.name === 'parser' ? parsers.find(p => p._id === route.id) : null;
  const activeJobId = activeParser?._id || null;

  return (
    <Layout route={route.name} onNavigate={navigate} activeJobId={activeJobId}>
      {route.name === 'feed' && (
        <FeedScreen
          feedQueue={feedQueue}
          onFeed={handleFeed}
          onForce={handleForce}
          onNavigate={navigate}
          activeJobId={null}
        />
      )}
      {route.name === 'parser' && activeParser && (
        <ManifestScreen
          parser={activeParser}
          onRegenerate={handleRegenerate}
          onNavigate={navigate}
        />
      )}
      {route.name === 'parser' && !activeParser && (
        <EmptyState
          title="Parser not found"
          body={`parser_id ${route.id} — 404`}
          cta={<Button variant="primary" onClick={() => navigate('history')}>Browse history</Button>}
        />
      )}
      {route.name === 'history' && (
        <HistoryScreen parsers={parsers} onOpen={(id) => navigate('parser', id)}/>
      )}
      {route.name === 'settings' && (
        <SettingsScreen
          baseUrl={baseUrl} onBaseUrlChange={setBaseUrl}
          config={config} onConfigChange={setConfig}
        />
      )}

      <div className="pf-toasts">
        {toasts.map(t => (
          <Toast key={t.id} kind={t.kind} title={t.title} body={t.body}
            onDismiss={() => setToasts(ts => ts.filter(x => x.id !== t.id))}/>
        ))}
      </div>
    </Layout>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
