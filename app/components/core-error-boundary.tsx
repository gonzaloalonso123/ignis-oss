"use client";

import React from "react";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  errorMessage: string | null;
};

export class CoreErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-dvh w-full flex-col items-center justify-center bg-paper p-6 text-center text-ink">
          <div className="max-w-md rounded-3xl border border-line bg-paper-raised p-8 shadow-sm">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-ember/15 text-ember">
              !
            </div>
            <h2 className="text-lg font-semibold">Workspace Interface Error</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              A recent self-building UI change threw a runtime error:{" "}
              <code className="rounded bg-recess px-1.5 py-0.5 font-mono text-ink">
                {this.state.errorMessage || "Unknown error"}
              </code>
            </p>
            <p className="mt-3 text-xs text-muted">
              Use the <strong>Core Control</strong> button in the bottom-left corner to roll back via Time Machine or repair via Emergency Recovery Chat.
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, errorMessage: null })}
              className="mt-5 rounded-full bg-ember px-5 py-2 text-xs font-semibold text-white transition hover:opacity-90"
            >
              Retry Render
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
