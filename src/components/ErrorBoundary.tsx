import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected rendering issue occurred.',
    };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Error details are captured safely in component state for the recovery UI.
  }

  private handleRetry = () => {
    this.setState({ hasError: false, errorMessage: null });
    this.props.onReset?.();
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="bg-white border border-red-200 rounded-xl p-8 text-center max-w-xl mx-auto my-8 shadow-xs"
        >
          <AlertCircle className="w-10 h-10 text-red-700 mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-slate-900">
            {this.props.fallbackTitle ?? 'Something went wrong in this view'}
          </h2>
          <p className="text-sm text-slate-600 mt-1.5">
            {this.state.errorMessage ?? 'Please retry loading the view or reload the page.'}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[42px] text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Try Again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2.5 min-h-[42px] text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
