const AUTH_KEYS = ['authToken', 'refreshToken', 'authExpiresAt', 'authProvider', 'authUser', 'userId', 'username', 'userEmail', 'avatarDataUrl'];

const hasSessionAuth = () => Boolean(sessionStorage.getItem('authToken'));
const hasLocalAuth = () => Boolean(localStorage.getItem('authToken'));

export const getAuthItem = (key) => {
  const sessionValue = sessionStorage.getItem(key);
  if (sessionValue !== null && sessionValue !== undefined) return sessionValue;
  return localStorage.getItem(key);
};

export const setAuthItem = (key, value, remember = true) => {
  const target = remember ? localStorage : sessionStorage;
  target.setItem(key, value);
  const other = remember ? sessionStorage : localStorage;
  other.removeItem(key);
};

export const setAuthItems = (items, remember = true) => {
  Object.entries(items).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    setAuthItem(key, String(value), remember);
  });
};

export const setAuthItemAuto = (key, value) => {
  const target = hasSessionAuth() && !hasLocalAuth() ? sessionStorage : localStorage;
  target.setItem(key, value);
  const other = target === sessionStorage ? localStorage : sessionStorage;
  other.removeItem(key);
};

export const removeAuthItem = (key) => {
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
};

export const clearAuth = () => {
  AUTH_KEYS.forEach(removeAuthItem);
};

export const getAuthStorageType = () => (hasSessionAuth() && !hasLocalAuth() ? 'session' : 'local');
