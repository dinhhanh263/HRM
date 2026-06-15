// "Remember me" persistence model.
//
// The refresh token lives in an httpOnly cookie the client can't read, so we
// keep our own record of whether the current login should outlive the browser
// session:
//   - localStorage PERSIST_KEY — set for "remember me" / SSO / register logins.
//     Survives a browser restart, so those sessions auto-resume on next launch.
//   - sessionStorage ACTIVE_KEY — set for every login. Survives reloads but is
//     dropped when the browser session ends, so a non-remembered login won't
//     auto-resume in a fresh session.
//
// On boot we silently restore only when one of these is present. Limitation:
// browsers set to "Continue where you left off" also restore sessionStorage, so
// a non-remembered login can still resume there — that is browser behavior we
// can't override. A new window/tab or a private window behaves as intended.

const PERSIST_KEY = 'hrm_persist';
const ACTIVE_KEY = 'hrm_active';

export function markLogin(persistent: boolean) {
  if (persistent) {
    localStorage.setItem(PERSIST_KEY, '1');
  } else {
    localStorage.removeItem(PERSIST_KEY);
  }
  sessionStorage.setItem(ACTIVE_KEY, '1');
}

export function markSessionActive() {
  sessionStorage.setItem(ACTIVE_KEY, '1');
}

export function clearSessionMarkers() {
  localStorage.removeItem(PERSIST_KEY);
  sessionStorage.removeItem(ACTIVE_KEY);
}

export function shouldResumeSession(): boolean {
  return (
    localStorage.getItem(PERSIST_KEY) === '1' || sessionStorage.getItem(ACTIVE_KEY) === '1'
  );
}
