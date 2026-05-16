// Settings — config knobs (read-only display + form for the runtime URL).

function SettingsScreen({ baseUrl, onBaseUrlChange, config, onConfigChange }) {
  const [draft, setDraft] = useState(baseUrl);
  const [dirty, setDirty] = useState(false);

  const save = () => { onBaseUrlChange(draft); setDirty(false); };

  return (
    <div className="pf-screen">
      <header className="pf-screen-h">
        <div>
          <div className="pf-eyebrow">Configuration</div>
          <h1 className="pf-h1">Settings</h1>
        </div>
      </header>

      <section className="pf-card pf-card-pad">
        <div className="pf-eyebrow">Runtime · client</div>
        <Field label="PATH_FINDER_URL" hint="Base URL the frontend hits. Build-time default is set with the PATH_FINDER_URL env var.">
          <div className="pf-input-attach">
            <Input mono value={draft} onChange={e => { setDraft(e.target.value); setDirty(true); }}/>
            <Button size="sm" variant="primary" disabled={!dirty} onClick={save}>Save</Button>
          </div>
        </Field>
      </section>

      <section className="pf-card pf-card-pad">
        <header className="pf-card-h">
          <div className="pf-eyebrow">Service · pipeline (read-only)</div>
          <span className="pf-mono pf-fg-3">GET /config</span>
        </header>
        <dl className="pf-deflist">
          <ConfigRow k="ai_endpoint"          v={config.ai_endpoint}/>
          <ConfigRow k="ai_model"             v={config.ai_model}/>
          <ConfigRow k="max_direct_kb"        v={config.max_direct_kb}        unit="kb"/>
          <ConfigRow k="top_n_nodes"          v={config.top_n_nodes}/>
          <ConfigRow k="max_sentences"        v={config.max_sentences}/>
          <ConfigRow k="max_sentence_chars"   v={config.max_sentence_chars}/>
          <ConfigRow k="similarity_threshold" v={config.similarity_threshold}/>
          <ConfigRow k="max_retries"          v={config.max_retries}/>
          <ConfigRow k="output_format"        v={config.output_format}/>
          <ConfigRow k="min_pages"            v={config.min_pages}/>
          <ConfigRow k="exclusions"           v={config.exclusions} array/>
        </dl>
      </section>
    </div>
  );
}

function ConfigRow({ k, v, unit, array }) {
  return (
    <div className="pf-defrow">
      <dt className="pf-mono">{k}</dt>
      <dd className="pf-mono">
        {array
          ? (v?.length
              ? v.map((s, i) => <span key={i} className="pf-tag pf-tag-neutral" style={{marginRight: 4}}>{s}</span>)
              : <span className="pf-fg-3">—</span>)
          : <><span className="pf-fg-1">{String(v)}</span>{unit && <span className="pf-fg-3"> {unit}</span>}</>}
      </dd>
    </div>
  );
}

Object.assign(window, { SettingsScreen });
