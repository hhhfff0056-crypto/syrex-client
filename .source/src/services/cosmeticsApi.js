import { getCurrentUser } from '../auth/supabaseAuth';
import { getAuthItem } from '../utils/authStorage';

const url = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '') + '/functions/v1/syrex-cosmetics';
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

export async function cosmeticsRequest(action, params = {}) {
  const user = await getCurrentUser();
  const token = getAuthItem('authToken');
  if (!user?.id || !token) throw new Error('Сначала войдите в аккаунт Syrex.');
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...params }),
      cache: 'no-store'
    });
  } catch {
    throw new Error('Не удалось подключиться к серверу косметики.');
  }
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(result.error || 'Ошибка синхронизации косметики.');
  return result;
}
