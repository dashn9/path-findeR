// Layout: top bar + left sidebar + main pane.

function Layout({ route, onNavigate, children, activeJobId }) {
  return (
    <div className="pf-shell">
      <TopBar activeJobId={activeJobId} onNavigate={onNavigate}/>
      <div className="pf-main">
        <Sidebar route={route} onNavigate={onNavigate}/>
        <main className="pf-content">{children}</main>
      </div>
    </div>
  );
}

function TopBar({ activeJobId, onNavigate }) {
  return (
    <header className="pf-topbar">
      <button className="pf-brand" onClick={() => onNavigate('feed')}>
        <span className="pf-brand-slash">/</span><span className="pf-brand-name">path-findeR</span>
      </button>

      <div className="pf-topbar-mid">
        {activeJobId && (
          <button className="pf-jobchip" onClick={() => onNavigate('parser', activeJobId)}>
            <Icon name="terminal" size={12}/>
            <span className="pf-mono">job_id:&nbsp;</span>
            <span className="pf-mono pf-jobchip-id">{activeJobId}</span>
          </button>
        )}
      </div>

      <div className="pf-topbar-right">
        <span className="pf-health"><i className="pf-pill-dot pf-pulse" style={{background:'#2F7A4A'}}/><span className="pf-mono">healthy</span></span>
        <button className="pf-iconbtn" onClick={() => onNavigate('settings')} title="Settings">
          <Icon name="settings" size={16}/>
        </button>
      </div>
    </header>
  );
}

function Sidebar({ route, onNavigate }) {
  const items = [
    { id: 'feed',     label: 'Feed',     icon: 'inbox' },
    { id: 'history',  label: 'History',  icon: 'list' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];
  return (
    <nav className="pf-sidebar">
      <div className="pf-sidebar-sec">
        <div className="pf-sidebar-h">Actions</div>
        {items.map(i => (
          <button key={i.id}
            className={`pf-navitem${route === i.id || (i.id === 'feed' && route === 'parser') ? ' pf-navitem-on' : ''}`}
            onClick={() => onNavigate(i.id)}>
            <Icon name={i.icon} size={14}/>
            <span>{i.label}</span>
          </button>
        ))}
      </div>
      <div className="pf-sidebar-sec">
        <div className="pf-sidebar-h">Endpoint</div>
        <div className="pf-sidebar-endpoint pf-mono">
          <span className="pf-sidebar-method">GET</span>
          <span>http://localhost:8000</span>
        </div>
      </div>
      <div className="pf-sidebar-foot pf-mono">
        v0.4.2 · go service
      </div>
    </nav>
  );
}

Object.assign(window, { Layout });
