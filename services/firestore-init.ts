// Firestore connection readiness.
//
// This used to disable then re-enable the Firestore network on first use to
// "force a fresh connection". That pattern is fragile and could leave Firestore
// stuck in the disabled state — serving stale cached data that never re-synced
// (especially on Safari, where it manifested as messages frozen days in the
// past). The Firestore SDK manages its own connection lifecycle, so this is now
// a no-op, kept only so existing callers don't need to change.

export const ensureFirestoreReady = async (): Promise<void> => {
  return;
};

export const resetFirestoreInit = (): void => {
  // no-op (retained for compatibility)
};
