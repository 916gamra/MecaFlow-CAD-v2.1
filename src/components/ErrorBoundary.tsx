import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-500">
          <h2 className="text-lg font-bold mb-2">خطأ فادح</h2>
          <p className="text-sm">{this.state.error?.message || 'حدث خطأ غير متوقع في العرض ثلاثي الأبعاد'}</p>
        </div>
      );
    }

    return this.props.children;
  }
}
