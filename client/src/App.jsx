import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthStatus, getDistributors, getHealth, getHistory, login, logout, matchDistributor, parsePdf, saveBlob } from './api.js';

const OUTPUT_COLUMNS = [
  ['pafk', 'Product'],
  ['sprice', 'Sale price'],
  ['sqty', 'Sale qty'],
  ['sbonus', 'Sale bonus'],
  ['salvalue', 'Sale value'],
  ['clqty', 'Closing qty'],
  ['clbonus', 'Closing bonus'],
  ['clvalue', 'Closing value'],
];

const UNRESOLVED_MESSAGE = 'Distributor could not be resolved from the filename.';

function isUnresolved(error) {
  return error.status === 422 && (error.code === 'DISTRIBUTOR_UNRESOLVED' || error.message === UNRESOLVED_MESSAGE);
}

function distributorLabel(distributor) {
  return [distributor.name, distributor.area, distributor.company?.name ?? distributor.company].filter(Boolean).join(' — ');
}

const PICKER_LIMIT = 50;

function distributorMeta(distributor) {
  return [distributor.area, distributor.company?.name ?? distributor.company].filter(Boolean).join(' · ') || 'No area on record';
}

function DistributorOption({ distributor, selected, onSelect }) {
  return <li role="option" aria-selected={selected}>
    <button type="button" className={`picker-option${selected ? ' selected' : ''}`} onClick={() => onSelect(distributor._id)}>
      <span><strong>{distributor.name}</strong><small>{distributorMeta(distributor)}</small></span>
      {selected && <Icon name="check"/>}
    </button>
  </li>;
}

function DistributorPicker({ distributors, suggestions, detectedId, loading, value, onChange }) {
  const [query, setQuery] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const selected = distributors.find((item) => item._id === value) || suggestions.find((item) => item._id === value);

  function select(id) {
    onChange(id);
    setBrowsing(false);
    setQuery('');
  }

  if (selected && !browsing) {
    const detected = selected._id === detectedId;
    return <div className="picker">
      <div className="picker-header">
        <strong id="picker-title">Distributor</strong>
        <span className={`picker-badge${detected ? ' detected' : ''}`}>{detected ? 'Detected from filename' : 'Selected manually'}</span>
      </div>
      <div className="picker-selected-card">
        <span className="file-icon"><Icon name="target"/></span>
        <span><strong>{selected.name}</strong><small>{distributorMeta(selected)}</small></span>
        <button type="button" className="button ghost" onClick={() => setBrowsing(true)}>Change</button>
      </div>
    </div>;
  }

  return <DistributorBrowser distributors={distributors} suggestions={suggestions} loading={loading} value={value}
    query={query} onQuery={setQuery} onSelect={select} onCancel={selected ? () => { setBrowsing(false); setQuery(''); } : null}/>;
}

function DistributorBrowser({ distributors, suggestions, loading, value, query, onQuery, onSelect, onCancel }) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const suggestedIds = new Set(suggestions.map((item) => item._id));
  const matches = terms.length
    ? distributors.filter((distributor) => {
      const label = distributorLabel(distributor).toLowerCase();
      return terms.every((term) => label.includes(term));
    })
    : distributors.filter((distributor) => !suggestedIds.has(distributor._id));
  const shown = matches.slice(0, PICKER_LIMIT);
  const showSuggestions = !terms.length && suggestions.length > 0;

  let emptyMessage = '';
  if (loading) emptyMessage = 'Loading distributors…';
  else if (!distributors.length && !suggestions.length) emptyMessage = 'No distributors are configured on the server. Contact your administrator.';
  else if (terms.length && !matches.length) emptyMessage = `No distributors match "${query.trim()}".`;

  return <div className="picker">
    <div className="picker-header">
      <strong id="picker-title">Select distributor</strong>
      {onCancel
        ? <button type="button" className="link-button" onClick={onCancel}>Cancel</button>
        : !loading && distributors.length > 0 && <small>{distributors.length.toLocaleString()} available</small>}
    </div>
    <div className="picker-search">
      <Icon name="search"/>
      <input type="search" aria-label="Search distributors" placeholder="Search by name, city or company" value={query} onChange={(event) => onQuery(event.target.value)} disabled={loading || !distributors.length} autoFocus={Boolean(onCancel)}/>
    </div>
    <div className="picker-list" role="listbox" aria-labelledby="picker-title">
      {emptyMessage && <p className="picker-empty">{loading && <span className="spinner dark"/>}{emptyMessage}</p>}
      {showSuggestions && <>
        <span className="picker-group">Suggested for this file</span>
        <ul>{suggestions.map((item) => <DistributorOption key={item._id} distributor={item} selected={value === item._id} onSelect={onSelect}/>)}</ul>
      </>}
      {shown.length > 0 && <>
        {showSuggestions && <span className="picker-group">All distributors</span>}
        <ul>{shown.map((item) => <DistributorOption key={item._id} distributor={item} selected={value === item._id} onSelect={onSelect}/>)}</ul>
      </>}
      {matches.length > PICKER_LIMIT && <p className="picker-more">Showing {PICKER_LIMIT} of {matches.length.toLocaleString()}. Type to narrow the list.</p>}
    </div>
  </div>;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function relativeTime(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${plural(Math.floor(seconds / 60), 'min')} ago`;
  if (seconds < 86400) return `${plural(Math.floor(seconds / 3600), 'hr')} ago`;
  return `${plural(Math.floor(seconds / 86400), 'day')} ago`;
}

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function Icon({ name }) {
  const paths = {
    upload: <><path d="M12 15V4m0 0 4 4m-4-4-4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></>,
    file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></>,
    sheet: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/></>,
    check: <path d="m5 12 5 5 9-10"/>,
    close: <path d="M6 6l12 12M18 6 6 18"/>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></>,
    shield: <><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/></>,
    target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></>,
    search: <><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function Brand() {
  return <a className="brand" href="/" aria-label="PDFParser home">
    <span className="brand-mark" aria-hidden="true"><Icon name="sheet"/></span>
    <strong>PDF<span>Parser</span></strong>
  </a>;
}

function CenteredShell({ children }) {
  return <main className="center-shell"><section className="panel center-panel">{children}</section></main>;
}

function LoginScreen({ error, loading, onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return <CenteredShell>
    <Brand/>
    <h1>Sign in</h1>
    <p className="muted">Use the credentials provided by your administrator.</p>
    <form className="stack" onSubmit={(event) => { event.preventDefault(); onLogin(username, password); }}>
      <label className="field">Username<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required autoFocus/></label>
      <label className="field">Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required/></label>
      {error && <div className="notice error" role="alert">{error}</div>}
      <button className="button primary block" disabled={loading}>{loading ? <><span className="spinner"/>Signing in…</> : 'Sign in'}</button>
    </form>
  </CenteredShell>;
}

function Topbar({ health, onSignOut }) {
  const status = health === null ? 'checking' : health ? 'online' : 'degraded';
  const label = { checking: 'Checking service…', online: 'Service online', degraded: 'Service degraded' }[status];
  return <header className="topbar">
    <div className="container topbar-inner">
      <Brand/>
      <div className="topbar-actions">
        <span className={`status-chip ${status}`}><i aria-hidden="true"/>{label}</span>
        {onSignOut && <button className="button ghost" onClick={onSignOut}>Sign out</button>}
      </div>
    </div>
  </header>;
}

function Hero({ health, maxUploadMb }) {
  const stats = [
    [health?.activeDistributors?.toLocaleString() ?? '—', 'Active distributors'],
    [health?.specializedParserRoutes?.toLocaleString() ?? '—', 'Specialized parsers'],
    [`${maxUploadMb} MB`, 'Max file size'],
  ];
  return <div className="hero-copy">
    <span className="eyebrow">Distributor report automation</span>
    <h1>Turn stock statements into <em>clean Excel</em> in seconds.</h1>
    <p className="lead">Upload a distributor's PDF or XLSX report. PDFParser detects the source format, extracts sales and closing figures, and returns a standardized workbook ready for analysis.</p>
    <ul className="features">
      <li><span className="feature-icon"><Icon name="target"/></span><div><strong>Automatic detection</strong><small>Identifies the distributor from the filename and applies its dedicated parser.</small></div></li>
      <li><span className="feature-icon"><Icon name="sheet"/></span><div><strong>Consistent output</strong><small>Every report maps to the same eight columns, whatever its source layout.</small></div></li>
      <li><span className="feature-icon"><Icon name="shield"/></span><div><strong>Private by default</strong><small>Files are processed on this server and only stored if you choose to.</small></div></li>
    </ul>
    <dl className="stats">
      {stats.map(([value, label]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  </div>;
}

function UploadPanel({ auth, onConverted }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [saveFile, setSaveFile] = useState(false);
  const [state, setState] = useState({ kind: 'idle', message: '' });
  const [distributors, setDistributors] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [distributorId, setDistributorId] = useState('');
  const [detectedId, setDetectedId] = useState('');
  const [matching, setMatching] = useState(false);
  const [loadingDistributors, setLoadingDistributors] = useState(false);
  const matchRequest = useRef(0);

  const formats = ['PDF', 'XLSX'];
  const accept = 'application/pdf,.pdf,.xlsx';
  const busy = state.kind === 'loading';

  function loadDistributors() {
    if (distributors.length || loadingDistributors) return;
    setLoadingDistributors(true);
    getDistributors()
      .then(setDistributors)
      .catch(() => setState({ kind: 'error', message: 'Could not load the distributor list. Please try again.' }))
      .finally(() => setLoadingDistributors(false));
  }

  // Detect the distributor as soon as a file is chosen so the user can confirm
  // or change it before converting. Stale responses for a previous file are ignored.
  function detectDistributor(filename) {
    const request = ++matchRequest.current;
    setMatching(true);
    matchDistributor(filename)
      .then(({ match, suggestions: matches }) => {
        if (request !== matchRequest.current) return;
        const list = match && !matches.some((item) => item._id === match._id) ? [match, ...matches] : matches;
        setSuggestions(list);
        setDetectedId(match?._id || '');
        setDistributorId(match?._id || '');
      })
      .catch(() => { if (request === matchRequest.current) setSuggestions([]); })
      .finally(() => { if (request === matchRequest.current) setMatching(false); });
  }

  function reset() {
    matchRequest.current += 1;
    setFile(null);
    setDistributorId('');
    setDetectedId('');
    setSuggestions([]);
    setMatching(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  function choose(nextFile) {
    if (!nextFile) return;
    const supported = /\.(?:pdf|xlsx)$/i.test(nextFile.name);
    if (!supported) {
      setState({ kind: 'error', message: `Unsupported file type. Please select a ${formats.join(', ')} file.` });
      return;
    }
    if (nextFile.size > auth.maxUploadMb * 1024 * 1024) {
      setState({ kind: 'error', message: `This file is ${formatSize(nextFile.size)}. The maximum size is ${auth.maxUploadMb} MB.` });
      return;
    }
    reset();
    setFile(nextFile);
    setState({ kind: 'ready', message: '' });
    loadDistributors();
    detectDistributor(nextFile.name);
  }

  async function submit(event) {
    event.preventDefault();
    if (!file || busy || !distributorId) return;
    setState({ kind: 'loading', message: 'Converting your report…' });
    try {
      const result = await parsePdf(file, saveFile, distributorId);
      saveBlob(result.blob, result.filename);
      setState({ kind: 'success', message: `${plural(result.rows, 'row')} converted. ${result.filename} has been downloaded.` });
      reset();
      onConverted();
    } catch (error) {
      if (isUnresolved(error)) {
        setSuggestions(error.suggestions || []);
        setDistributorId('');
        setState({ kind: 'error', message: 'Please select the distributor for this report.' });
        loadDistributors();
        return;
      }
      setState({ kind: 'error', message: error.message });
    }
  }

  return <section className="panel upload-panel" aria-labelledby="upload-title">
    <div className="panel-heading">
      <div>
        <span className="kicker">New conversion</span>
        <h2 id="upload-title">Upload a report</h2>
      </div>
      <div className="format-tags" aria-label="Supported formats">{formats.map((format) => <span key={format}>{format}</span>)}</div>
    </div>

    <form onSubmit={submit}>
      {file
        ? <div className="file-card">
          <span className="file-icon"><Icon name="file"/></span>
          <div><strong title={file.name}>{file.name}</strong><small>{formatSize(file.size)} · Ready to convert</small></div>
          <button type="button" className="icon-button" onClick={() => { reset(); setState({ kind: 'idle', message: '' }); }} disabled={busy} aria-label="Remove file"><Icon name="close"/></button>
        </div>
        : <label className={`dropzone${dragging ? ' dragging' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0]); }}>
          <input ref={inputRef} className="visually-hidden" type="file" accept={accept} onChange={(event) => choose(event.target.files[0])}/>
          <span className="drop-icon"><Icon name="upload"/></span>
          <strong>Drag and drop your report</strong>
          <small>or <u>browse your computer</u> · up to {auth.maxUploadMb} MB</small>
        </label>}

      {file && (matching
        ? <div className="picker"><p className="picker-empty"><span className="spinner dark"/>Detecting distributor from filename…</p></div>
        : <DistributorPicker key={`${file.name}-${file.size}-${file.lastModified}`} distributors={distributors} suggestions={suggestions} detectedId={detectedId}
          loading={loadingDistributors} value={distributorId} onChange={setDistributorId}/>)}

      <label className="toggle">
        <input type="checkbox" checked={saveFile} onChange={(event) => setSaveFile(event.target.checked)}/>
        <i aria-hidden="true"/>
        <span><strong>Keep a copy on the server</strong><small>Store the generated workbook for later retrieval.</small></span>
      </label>

      <div aria-live="polite">
        {state.message && state.kind !== 'ready' && <div className={`notice ${{ error: 'error', success: 'success' }[state.kind] || 'info'}`} role={state.kind === 'error' ? 'alert' : 'status'}>
          {state.kind === 'success' && <Icon name="check"/>}{state.message}
        </div>}
      </div>

      <button className="button primary block" disabled={!file || busy || matching || !distributorId}>
        {busy ? <><span className="spinner"/>Processing…</> : <>{file && !matching && !distributorId ? 'Select a distributor to continue' : 'Convert to Excel'} <Icon name="arrow"/></>}
      </button>
    </form>
  </section>;
}

function HowItWorks() {
  const steps = [
    ['Upload', 'Drop a distributor stock statement. The filename identifies the distributor.'],
    ['Parse', 'The matching parser extracts product lines, quantities, bonuses and values.'],
    ['Download', 'Receive a normalized .xlsx workbook with a frozen header row.'],
  ];
  return <section className="section" aria-labelledby="how-title">
    <div className="section-heading">
      <span className="kicker">How it works</span>
      <h2 id="how-title">Three steps, one standard format</h2>
    </div>
    <div className="section-grid">
      <ol className="steps">
        {steps.map(([title, text], index) => <li key={title}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{title}</strong><p>{text}</p></div></li>)}
      </ol>
      <div className="panel schema">
        <div className="schema-heading"><Icon name="sheet"/><strong>Output schema</strong><small>Parsed Data sheet</small></div>
        <ul>
          {OUTPUT_COLUMNS.map(([key, label]) => <li key={key}><code>{key}</code><span>{label}</span></li>)}
        </ul>
      </div>
    </div>
  </section>;
}

function HistoryPanel({ history, loading, onRefresh }) {
  return <section className="panel history-panel" aria-labelledby="history-title">
    <div className="panel-heading bordered">
      <div>
        <span className="kicker">Activity</span>
        <h2 id="history-title">Recent conversions</h2>
      </div>
      <button className="button ghost" onClick={onRefresh} disabled={loading}><Icon name="refresh"/>Refresh</button>
    </div>
    {!history.length
      ? <div className="empty"><Icon name="file"/><strong>No conversions yet</strong><small>Converted reports will appear here.</small></div>
      : <ul className="history-list">
        {history.map((item) => <li key={item.id}>
          <span className={`history-icon ${item.status}`}><Icon name={item.status === 'failed' ? 'close' : 'sheet'}/></span>
          <div className="history-main">
            <strong>{item.distributor}</strong>
            <small title={item.status === 'failed' && item.error ? item.error : item.filename}>{item.status === 'failed' && item.error ? item.error : item.filename}</small>
          </div>
          <span className={`badge ${item.status}`}>{item.status === 'failed' ? 'Failed' : item.rowCount == null ? 'Imported' : plural(item.rowCount, 'row')}</span>
          <time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString()}>{relativeTime(item.createdAt)}</time>
        </li>)}
      </ul>}
  </section>;
}

export function App() {
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [health, setHealth] = useState(null);
  const [auth, setAuth] = useState({ loading: true, available: false, required: false, authenticated: false, maxUploadMb: 10, error: '' });

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setHistory(await getHistory());
    } catch {
      /* upload remains usable */
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    getAuthStatus()
      .then((result) => setAuth({ ...result, loading: false, available: true, error: '' }))
      .catch((error) => setAuth((current) => ({ ...current, loading: false, available: false, error: error.message })));
  }, []);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => setHealth(false));
  }, []);

  useEffect(() => {
    if (!auth.authenticated) return undefined;
    refreshHistory();
    const timer = setInterval(refreshHistory, 30000);
    return () => clearInterval(timer);
  }, [auth.authenticated, refreshHistory]);

  async function handleLogin(username, password) {
    setAuth((current) => ({ ...current, loading: true, error: '' }));
    try {
      await login(username, password);
      const result = await getAuthStatus();
      setAuth({ ...result, loading: false, available: true, error: '' });
    } catch (error) {
      setAuth((current) => ({ ...current, loading: false, error: error.message }));
    }
  }

  async function handleLogout() {
    await logout().catch(() => undefined);
    setHistory([]);
    setAuth((current) => ({ ...current, authenticated: false }));
  }

  if (auth.loading && !auth.authenticated) return <CenteredShell><Brand/><p className="muted loading-line"><span className="spinner dark"/>Checking secure session…</p></CenteredShell>;
  if (!auth.available) return <CenteredShell>
    <Brand/>
    <h1>Can't reach the server</h1>
    <p className="muted">{auth.error || 'The API is not responding.'}</p>
    <button className="button primary block" onClick={() => window.location.reload()}>Retry connection</button>
  </CenteredShell>;
  if (auth.required && !auth.authenticated) return <LoginScreen error={auth.error} loading={auth.loading} onLogin={handleLogin}/>;

  return <div className="app-shell">
    <Topbar health={health} onSignOut={auth.required ? handleLogout : null}/>
    <main className="container">
      <section className="hero">
        <Hero health={health || null} maxUploadMb={auth.maxUploadMb}/>
        <UploadPanel auth={auth} onConverted={refreshHistory}/>
      </section>
      <HistoryPanel history={history} loading={historyLoading} onRefresh={refreshHistory}/>
      <HowItWorks/>
    </main>
    <footer className="footer">
      <div className="container footer-inner">
        <Brand/>
        <span>Distributor report automation · Processed on your infrastructure</span>
      </div>
    </footer>
  </div>;
}
