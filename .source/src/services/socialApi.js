import { getCurrentUser } from '../auth/supabaseAuth';
import { getAuthItem } from '../utils/authStorage';

const baseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

export async function socialRequest(action, args = {}) {
  const user = await getCurrentUser();
  const token = getAuthItem('authToken');
  if (!user?.id || !token) throw new Error('Для друзей Syrex нужно войти в аккаунт.');
  let response;
  try {
    response = await fetch(baseUrl + '/functions/v1/syrex-social', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: publishableKey,
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({ action, ...args }),
      cache: 'no-store'
    });
  } catch {
    throw new Error('Не удалось подключиться к серверу друзей.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Ошибка работы со списком друзей.');
  return data;
}
