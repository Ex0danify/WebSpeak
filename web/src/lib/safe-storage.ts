// localStorage can refuse: a full quota makes setItem throw, and some browser settings make even
// reading the localStorage property throw. None of it may break the page, so every caller goes
// through these three functions: a read answers null, a write answers false, a remove does nothing.

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // nothing to remove when storage is unavailable
  }
}
