import { Component, type ReactNode } from 'react';
import i18n from '../i18n';

/**
 * The last line of defence: a rendering error shows a way forward instead of a
 * blank window. Saved pages are safe on disk and the vault stays open, so a
 * reload puts the writer back where they were.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h1 className="t-display">{i18n.t('common.crashTitle')}</h1>
        <p>{i18n.t('common.crashBody')}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          {i18n.t('common.reload')}
        </button>
      </div>
    );
  }
}
