"use client";
import { Component, type ReactNode } from "react";
export class SceneBoundary extends Component<
  { children: ReactNode; onFallback: () => void },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch() {
    this.props.onFallback();
  }
  render() {
    return this.state.error ? (
      <div className="scene-loading">
        3D недоступне. Відкриваємо список сесій…
      </div>
    ) : (
      this.props.children
    );
  }
}
