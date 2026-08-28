/**
 * Safe client-side storage reset utility.
 * Only executes when explicitly called by the user or an administrative reset trigger.
 */
export async function hardResetApp() {
  try {
    // 1. Unregister all active Service Workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.unregister()));
    }

    // 2. Clear browser Cache Storage
    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    }

    // 3. Clear LocalStorage and SessionStorage
    localStorage.clear();
    sessionStorage.clear();

    // 4. Delete IndexedDB database offline caches safely
    if (window.indexedDB) {
      try {
        indexedDB.deleteDatabase('keyval-store');
      } catch (e) {
        console.warn('IndexedDB purge skipped:', e);
      }
    }

    // 5. Force clean reload to root origin
    window.location.href = '/';
  } catch (error) {
    console.error('Failed to reset application cache:', error);
    window.location.reload();
  }
}