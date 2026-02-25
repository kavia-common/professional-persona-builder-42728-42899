'use client';

import App from '../app/App';

/**
 * Client entrypoint expected by some earlier code/imports/layouts.
 * We keep it as a thin wrapper around the actual app UI component.
 */

// PUBLIC_INTERFACE
export default function AppClient() {
  /** Renders the main application client UI. */
  return <App />;
}
