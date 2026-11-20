import { getCurrentUser } from '../auth/supabaseAuth';
import { getAuthItem } from '../utils/authStorage';

const baseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

export const licenseRequest = async (action, params = {}) => {
  const user = await getCurrentUser();
  const token = getAuthItem('authToken');
  if (!user?.id || !token) throw new Error('Сначала войдите в аккаунт Syrex.');
  let response;
  try {
    response = await fetch(baseUrl + '/functions/v1/syrex-keys', {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action, ...params }),
      cache: 'no-store'
    });
  } catch {
    throw new Error('Не удалось подключиться к серверу ключей.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Не удалось выполнить операцию.');
    error.status = response.status;
    throw error;
  }
  return data;
};

export const getLicenseStatus = () => licenseRequest('status');
export const redeemLicenseKey = (key) => licenseRequest('redeem', { key });
const requestDownload = async (action) => {
  const data = await licenseRequest(action);
  if (!data.url || !/^https:\/\//.test(data.url)) throw new Error('Ссылка для скачивания недоступна.');
  window.location.assign(data.url);
};

export const downloadLicensedClient = () => requestDownload('download');
// Free downloads require a verified Syrex session, just like Premium.
// Note: a publicly shared Dropbox URL cannot itself be made private.
export const downloadFreeClient = () => requestDownload('download-free');

export const listAdminUsers = (page = 1) => licenseRequest('admin-users', { page });
export const manageAdminSubscription = (userId, mode, days = 0) =>
  licenseRequest('admin-subscription', { userId, mode, days });

export const pingSitePresence = () => licenseRequest('presence');
