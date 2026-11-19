import { Component, type ComponentChildren } from 'preact'

// one broken child shows the fallback and never takes the rest of the console with it
export class ErrorBoundary extends Component<{ fallback: (error: Error) => ComponentChildren; children: ComponentChildren }, { error: Error | null }> {
  state = { error: null as Error | null }
  componentDidCatch(error: Error) {
    this.setState({ error })
  }
  render() {
    const { error } = this.state
    return error ? this.props.fallback(error) : this.props.children
  }
}
