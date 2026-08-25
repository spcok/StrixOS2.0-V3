// src/lib/telemetry.ts
export function initGlobalTelemetry() {
  if (typeof window === 'undefined') return;

  window.addEventListener('unhandledrejection', (event) => {
    console.warn('[Telemetry] Unhandled Promise Rejection:', event.reason);
  });

  window.addEventListener('error', (event) => {
    console.warn('[Telemetry] Global Error:', event.error || event.message);
  });
}