import { getCurrentUser } from '../auth/supabaseAuth';
import { getAuthItem } from '../utils/authStorage';

const baseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

export const getDeviceStatus = async () => {
  const user = await getCurrentUser();
  const token = getAuthItem('authToken');
  if (!user?.id || !token) throw new Error('Войдите в аккаунт Syrex.');
  let response;
  try {
    response = await fetch(baseUrl + '/functions/v1/syrex-device', {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'status' }),
      cache: 'no-store'
    });
  } catch {
    throw new Error('Не удалось проверить привязку устройства.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Ошибка проверки устройства.');
  return data;
};
