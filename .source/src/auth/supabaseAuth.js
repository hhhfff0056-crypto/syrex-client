import { clearAuth, getAuthItem, getAuthStorageType, setAuthItems } from '../utils/authStorage';

const baseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
const turnstileEnabled = Boolean((import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim());
export const authConfigured = /^https:\/\/[^/]+$/i.test(baseUrl) && key.startsWith('sb_publishable_');

// This challenge is checked on the server before requesting Supabase Auth.
// It limits casual automated submissions from the UI; public Auth endpoints
// still need native CAPTCHA/rate limits for stronger abuse prevention.
const verifyCaptcha = async (captchaToken) => {
  if (turnstileEnabled) {
    if (!captchaToken || captchaToken.length > 4096) throw new Error('Пройдите проверку безопасности.');
    // Supabase Auth verifies the token with its private Turnstile secret.
    return;
  }
  if (!captchaToken) throw new Error('Решите пример для проверки.');
  let payload;
  try {
    payload = JSON.parse(captchaToken);
  } catch {
    throw new Error('Ошибка капчи. Обновите пример.');
  }
  if (!payload || typeof payload.nonce !== 'string') {
    throw new Error('Неверная капча. Обновите пример.');
  }
  let response;
  try {
    response = await fetch(baseUrl + '/functions/v1/syrex-captcha?mode=verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });
  } catch {
    throw new Error('Не удалось связаться с проверкой капчи.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success !== true) {
    throw new Error(response.status === 403
      ? 'Неправильный ответ или время истекло. Решите новый пример.'
      : 'Проверка капчи временно недоступна.');
  }
};

const redirectUrl = () => window.location.origin + import.meta.env.BASE_URL + 'login';

const request = async (path, { method = 'GET', payload, accessToken } = {}) => {
  if (!authConfigured) throw new Error('Авторизация пока не подключена к серверу.');
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = 'Bearer ' + accessToken;
  let response;
  try {
    response = await fetch(baseUrl + '/auth/v1/' + path, {
      method,
      headers,
      ...(payload ? { body: JSON.stringify(payload) } : {}),
      cache: 'no-store'
    });
  } catch {
    throw new Error('Не удалось связаться с сервером авторизации. Проверьте интернет.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.msg || result.message || result.error_description || result.error || 'Ошибка авторизации');
    error.status = response.status;
    throw error;
  }
  return result;
};

const persistSession = (result, remember) => {
  if (!result.access_token || !result.refresh_token || !result.user?.id) {
    throw new Error('Сервис не вернул действительный сеанс.');
  }
  const user = result.user;
  const expiry = Date.now() + (Number(result.expires_in) || 3600) * 1000;
  setAuthItems({
    authProvider: 'supabase',
    authToken: result.access_token,
    refreshToken: result.refresh_token,
    authExpiresAt: String(expiry),
    authUser: String(user.app_metadata?.role || 'DEFAULT'),
    userId: String(user.id),
    username: String(user.user_metadata?.username || user.email?.split('@')[0] || 'User'),
    userEmail: String(user.email || '')
  }, remember);
  return user;
};

export const signIn = async (email, password, remember = true, captchaToken = '') => {
  await verifyCaptcha(captchaToken);
  const result = await request('token?grant_type=password', {
    method: 'POST',
    payload: {
      email: email.trim().toLowerCase(), password,
      ...(turnstileEnabled ? { gotrue_meta_security: { captcha_token: captchaToken } } : {})
    }
  });
  return persistSession(result, remember);
};

export const register = async (username, email, password, captchaToken = '') => {
  await verifyCaptcha(captchaToken);
  const result = await request('signup?redirect_to=' + encodeURIComponent(redirectUrl()), {
    method: 'POST',
    payload: {
      email: email.trim().toLowerCase(), password, data: { username: username.trim() },
      ...(turnstileEnabled ? { gotrue_meta_security: { captcha_token: captchaToken } } : {})
    }
  });
  if (result.access_token && result.refresh_token) {
    return { needsConfirmation: false, user: persistSession(result, true) };
  }
  return { needsConfirmation: true };
};

let refreshing = null;
export const refreshSession = async () => {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    if (getAuthItem('authProvider') !== 'supabase') return null;
    const token = getAuthItem('refreshToken');
    if (!token) return null;
    const remember = getAuthStorageType() === 'local';
    try {
      const result = await request('token?grant_type=refresh_token', {
        method: 'POST',
        payload: { refresh_token: token }
      });
      return persistSession(result, remember);
    } catch (error) {
      if (error.status === 400 || error.status === 401) clearAuth();
      throw error;
    }
  })().finally(() => { refreshing = null; });
  return refreshing;
};

export const getCurrentUser = async () => {
  if (!authConfigured || getAuthItem('authProvider') !== 'supabase') return null;
  let token = getAuthItem('authToken');
  if (!token || Date.now() > Number(getAuthItem('authExpiresAt') || 0) - 30000) {
    await refreshSession();
    token = getAuthItem('authToken');
  }
  if (!token) return null;
  try {
    return await request('user', { accessToken: token });
  } catch (error) {
    if (error.status !== 401) throw error;
    const refreshed = await refreshSession();
    if (!refreshed) return null;
    return request('user', { accessToken: getAuthItem('authToken') });
  }
};

let emailRedirectPromise = null;
export const completeEmailRedirect = async () => {
  if (emailRedirectPromise) return emailRedirectPromise;
  const fragment = window.location.hash.slice(1);
  if (!fragment.includes('access_token=') && !fragment.includes('error=')) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  const params = new URLSearchParams(fragment);
  if (params.get('error')) throw new Error(params.get('error_description') || 'Ссылка подтверждения недействительна.');
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) throw new Error('Неполная ссылка подтверждения.');
  emailRedirectPromise = (async () => {
    const user = await request('user', { accessToken });
    persistSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: Number(params.get('expires_in')) || 3600,
      user
    }, true);
    return { user, isRecovery: params.get('type') === 'recovery' };
  })();
  return emailRedirectPromise;
};

export const sendRecovery = async (email, captchaToken = '') => {
  await verifyCaptcha(captchaToken);
  return request('recover?redirect_to=' + encodeURIComponent(redirectUrl()), {
    method: 'POST',
    payload: {
      email: email.trim().toLowerCase(),
      ...(turnstileEnabled ? { gotrue_meta_security: { captcha_token: captchaToken } } : {})
    }
  });
};

export const updatePassword = async (password) => {
  const user = await getCurrentUser();
  if (!user) throw new Error('Сеанс истёк. Запросите новую ссылку.');
  return request('user', {
    method: 'PUT',
    accessToken: getAuthItem('authToken'),
    payload: { password }
  });
};

export const signOut = async () => {
  const token = getAuthItem('authToken');
  const provider = getAuthItem('authProvider');
  clearAuth();
  if (provider === 'supabase' && token && authConfigured) {
    try {
      await request('logout', { method: 'POST', accessToken: token });
    } catch {
      // The local session is already removed, including on network failure.
    }
  }
};
