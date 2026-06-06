import { Component, type ReactNode } from 'react';

interface Props {
  fallback: ReactNode;
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

// A minimal React error boundary. Inside the R3F tree it catches a GLB load/decode failure
// (useGLTF throws on a bad fetch) and swaps in a 3D fallback so the canvas never goes blank.
// SECURITY: componentDidCatch deliberately logs only a synthetic marker -- never the error
// object, whose message could embed a filesystem path or other detail we don't want surfaced.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(): void {
    console.warn('crash_render_subtree_failed');
  }

  render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
