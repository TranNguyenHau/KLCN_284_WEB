import { Component } from 'react';
import { RotateCw, ArrowLeft, Home, TriangleAlert } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';

/**
 * A crashed render used to leave an empty, unresponsive page (React unmounts the whole
 * tree on an uncaught error). Wrapping the routes keeps the shell alive and gives the
 * user a way out: retry, go back, or return to the dashboard.
 */
function CrashScreen({ error, onRetry }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const canGoBack = (window.history.state?.idx ?? 0) > 0;

  return (
    <div className="p-4" role="alert">
      <div className="glass mx-auto max-w-2xl rounded-xl p-6">
        <div className="flex items-center gap-2 text-down">
          <TriangleAlert size={18} />
          <h1 className="text-base font-semibold">{t('error.title')}</h1>
        </div>
        <p className="mt-2 text-sm text-muted">{t('error.body')}</p>

        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">{t('error.details')}</p>
        <code className="mt-1 block max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line/70 bg-surface/60 p-3 font-mono text-xs text-muted">
          {error?.message || String(error)}
        </code>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            <RotateCw size={14} />
            {t('error.retry')}
          </button>
          <button type="button" className="btn" onClick={() => (canGoBack ? navigate(-1) : navigate('/'))}>
            <ArrowLeft size={14} />
            {t('error.back')}
          </button>
          <Link className="btn" to="/">
            <Home size={14} />
            {t('error.home')}
          </Link>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            {t('error.reload')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the detail in the console for debugging; the UI shows a readable screen.
    console.error('[Alpha Markets] render error', error, info?.componentStack);
  }

  componentDidUpdate(previous) {
    // Navigating elsewhere is a fresh attempt, so leave the crashed state behind.
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <CrashScreen error={this.state.error} onRetry={() => this.setState({ error: null })} />;
  }
}
