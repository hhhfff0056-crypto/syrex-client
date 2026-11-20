import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Users, Search, ArrowLeft, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { listAdminUsers, manageAdminSubscription } from '../services/licenseApi';
import './AdminUsers.css';

const formatDate = (value) => value ? new Date(value).toLocaleDateString('ru-RU') : 'Бессрочно';

export default function AdminUsers() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [duration, setDuration] = useState('30');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const requestId = useRef(0);

  const load = async (p = page) => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const result = await listAdminUsers(p);
      if (id !== requestId.current) return;
      setUsers(result.users || []);
      setHasMore(Boolean(result.hasMore));
    } catch (err) {
      if (id !== requestId.current) return;
      setUsers([]);
      setHasMore(false);
      setError(err.message || 'Не удалось загрузить пользователей.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    load(page);
    return () => { requestId.current += 1; };
  }, [page]);

  const visible = useMemo(() => users.filter((u) => {
    const q = search.trim().toLowerCase();
    return !q || [u.username, u.email, String(u.uid ?? ''), u.id, u.device?.fingerprint]
      .some((v) => String(v || '').toLowerCase().includes(q));
  }), [users, search]);

  const changeSubscription = async (u, mode) => {
    const label = mode === 'grant' ? 'выдать Premium' :
      mode === 'revoke' ? 'отозвать Premium' : 'вернуть обычную подписку';
    if (!window.confirm('Вы действительно хотите ' + label + ' пользователю ' + u.username + '?')) return;
    setBusy(u.id);
    setError('');
    setMessage('');
    try {
      await manageAdminSubscription(u.id, mode, Number(duration));
      setMessage('Подписка пользователя ' + u.username + ' обновлена.');
      await load(page);
    } catch (err) {
      setError(err.message || 'Не удалось изменить подписку.');
    } finally {
      setBusy('');
    }
  };

  return <main className="syrex-admin-users">
    <div className="syrex-admin-users-inner">
      <button type="button" className="syrex-admin-back" onClick={() => navigate('/profile')}>
        <ArrowLeft size={17}/> В профиль
      </button>
      <div className="syrex-admin-heading">
        <div><h1><ShieldCheck size={27}/> Управление пользователями</h1>
          <p>Зарегистрированные аккаунты Syrex, подписки и активность на сайте</p></div>
        <button type="button" className="syrex-admin-refresh" disabled={loading} onClick={() => load()}>
          <RefreshCw size={16}/> Обновить
        </button>
      </div>
      <div className="syrex-admin-controls">
        <label className="syrex-admin-search"><Search size={17}/>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по нику, почте, UID или ID устройства"/>
        </label>
        <label className="syrex-admin-duration">Срок Premium
          <select value={duration} onChange={(e) => setDuration(e.target.value)}>
            <option value="7">7 дней</option><option value="30">30 дней</option>
            <option value="90">90 дней</option><option value="365">365 дней</option>
            <option value="0">Навсегда</option>
          </select>
        </label>
      </div>
      {error && <p className="syrex-admin-error" role="alert">{error}</p>}
      {message && <p className="syrex-admin-message" role="status">{message}</p>}
      <div className="syrex-admin-list">
        {loading ? <p className="syrex-admin-empty">Загружаем пользователей…</p> :
          error ? <p className="syrex-admin-empty">Не удалось получить список. Нажмите «Обновить».</p> : visible.length ? visible.map((u) => {
            const locked = ['ADMIN', 'DEV', 'DEVELOPER'].includes(u.role);
            return <div className="syrex-admin-user" key={u.id}>
              <div className="syrex-admin-user-info">
                <div className="syrex-admin-user-name"><Users size={17}/> {u.username}
                  <span className={'syrex-admin-status ' + (u.premium ? 'premium' : '')}>
                    {u.premium ? 'PREMIUM' : 'FREE'}</span></div>
                <div className="syrex-admin-user-meta">{u.email} · UID {u.uid ?? '—'} · {u.role}</div>
                <div className="syrex-admin-user-meta" style={{ color: u.online ? '#75d69c' : undefined }}>
                  {u.online ? '● На сайте сейчас' : '○ Не в сети'}
                  {!u.online && u.lastSeenAt ? ' · Был на сайте: ' + new Date(u.lastSeenAt).toLocaleString('ru-RU') : ''}
                </div>
                <div className="syrex-admin-user-meta">Устройство: {u.device ? `HWID-хеш ${u.device.fingerprint}… · Последний вход ${new Date(u.device.lastSeenAt).toLocaleString("ru-RU")}` : "не привязано или нет доступа"}</div>
                <div className="syrex-admin-user-meta">Регистрация: {formatDate(u.createdAt)}
                  {u.premium && ' · Подписка до: ' + formatDate(u.expiresAt)}
                  {u.overrideMode === 'revoke' && ' · Подписка отключена администратором'}
                </div>
              </div>
              <div className="syrex-admin-actions">
                {locked ? <span className="syrex-admin-locked">Администратор</span> : <>
                  <button disabled={Boolean(busy)} onClick={() => changeSubscription(u, 'grant')}>Выдать Premium</button>
                  <button disabled={Boolean(busy)} onClick={() => changeSubscription(u, 'revoke')}>Отозвать</button>
                  {u.overrideMode && <button disabled={Boolean(busy)} onClick={() => changeSubscription(u, 'reset')}>Сбросить изменение</button>}
                </>}
              </div>
            </div>;
          }) : <p className="syrex-admin-empty">Пользователи не найдены.</p>}
      </div>
      <div className="syrex-admin-pagination">
        <button type="button" disabled={loading || page <= 1} onClick={() => { setPage((n) => n - 1); setSearch(''); }}><ChevronLeft size={16}/> Назад</button>
        <span>Страница {page}</span>
        <button type="button" disabled={loading || !hasMore} onClick={() => { setPage((n) => n + 1); setSearch(''); }}>Далее <ChevronRight size={16}/></button>
      </div>
      <p className="syrex-admin-footnote">Доступ к списку и изменениям проверяется на сервере Supabase. Сроки применяются сразу.</p>
    </div>
  </main>;
}
