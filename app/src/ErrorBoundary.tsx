import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Fängt Ausnahmen aus dem Render-Baum ab, die React sonst bis zur Wurzel
 * durchreicht -- ohne diese Hülle heisst das: die ganze Seite verschwindet,
 * `#root` bleibt leer, und auf dunklem Hintergrund sieht das aus wie ein
 * Absturz ohne jede Oberfläche, nicht von einem hängenden Ladevorgang zu
 * unterscheiden. Ein Neu-laden-Knopf ist kein Fix für die Ursache, aber der
 * Unterschied zwischen "die App ist weg" und "die App bittet um einen
 * Neustart" ist genau der, den es hier braucht.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('BEUTELTIER: unbehandelter Fehler im Render-Baum', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="root-fallback">
          <p>Etwas ist schiefgelaufen.</p>
          <button type="button" onClick={() => location.reload()}>
            Neu laden
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
