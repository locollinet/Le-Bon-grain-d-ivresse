import React from 'react';
import { RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || "Une erreur d'affichage inattendue est survenue.",
    };
  }

  componentDidCatch(error: Error) {
    console.error('[App ErrorBoundary]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F6F6F4] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-[#E5E4DF] rounded-xl p-6 space-y-4 shadow-sm">
            <h1 className="font-display text-2xl font-semibold text-[#141413]">
              Le Bon Grain d’Ivresse
            </h1>
            <p className="text-sm text-[#6B6B66]">
              L’écran a rencontré un problème inattendu. Vos données locales sont
              conservées.
            </p>
            {this.state.message && (
              <div className="p-3 bg-[#FAF9F7] border border-[#E5E4DF] rounded-lg text-xs text-[#B91C1C] font-mono-num break-words">
                {this.state.message}
              </div>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#721C24] hover:bg-[#5B151C] rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Recharger l’application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
