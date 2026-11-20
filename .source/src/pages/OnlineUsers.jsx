import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Gamepad2, Globe2, RefreshCw, Server, Users } from 'lucide-react';
import { licenseRequest, pingSitePresence } from '../services/licenseApi';
import { getCurrentUser } from '../auth/supabaseAuth';
import './OnlineUsers.css';

function Member({ member }) {
  const status = member.playing
    ? member.server ? 'Играет на ' + member.server : 'В Minecraft с Syrex'
    : 'На сайте';
  return <div className="syrex-online-member">
    <div className="syrex-online-avatar" aria-hidden="true">
      {String(member.nickname || 'S').charAt(0).toUpperCase()}
      <span className="syrex-online-dot" />
    </div>
    <div className="syrex-online-member-main">
      <strong>{member.nickname}{member.me && <span className="syrex-online-me">Вы</span>}</strong>
      <small><span className="syrex-online-status-dot" /> {status}</small>
    </div>
    <span className={'syrex-online-activity' + (member.playing ? ' game' : '')}>
      {member.playing ? <Gamepad2 size={15}/> : <Globe2 size={15}/>}
      {member.playing ? 'В игре' : 'На сайте'}
    </span>
  </div>;
}

export default function OnlineUsers() {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [count, setCount] = useState(0);
  const [visible, setVisible] = useState(true);
  const [serverVisible, setServerVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const lastLoad = useRef(0);
  const inFlight = useRef(false);
  const retryAfter = useRef(0);

  const reload = useCallback(async () => {
    if (document.visibilityState === 'hidden' || inFlight.current || Date.now() < retryAfter.current || Date.now() - lastLoad.current < 12000) return;
    inFlight.current = true;
    lastLoad.current = Date.now();
    try {
      const result = await licenseRequest('online-users');
      setMembers(Array.isArray(result.members) ? result.members : []);
      setCount(Number(result.count) || 0);
      setVisible(result.visible !== false);
      setServerVisible(result.serverVisible === true);
      setError('');
    } catch (err) {
      if (err.status === 429) retryAfter.current = Date.now() + 65000;
      setError(err.status === 429 ? 'Сервер ограничил частые запросы. Список обновится автоматически через минуту.' : (err.message || 'Не удалось загрузить онлайн.'));
    } finally { inFlight.current = false; setLoading(false); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser().then(user => {
      if (cancelled) return;
      if (!user) navigate('/login', { replace: true });
      else {
        setVerified(true);
        reload();
      }
    }).catch(() => {
      if (!cancelled) navigate('/login', { replace: true });
    });
    return () => { cancelled = true; };
  }, [navigate, reload]);

  useEffect(() => {
    if (!verified) return undefined;
    const interval = setInterval(reload, 25000);
    document.addEventListener('visibilitychange', reload);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', reload);
    };
  }, [verified, reload]);

  const toggle = async (field, enabled) => {
    if (busy) return;
    setBusy(field);
    setError('');
    try {
      await licenseRequest(field === 'server' ? 'server-visibility' : 'presence-visibility', { enabled });
      await reload();
    } catch (err) { setError(err.message || 'Не удалось изменить настройку.'); }
    finally { setBusy(''); }
  };

  return <main className="syrex-online-page">
    <div className="syrex-online-layout">
      <button className="syrex-online-back" type="button" onClick={() => navigate('/profile')}>
        <ArrowLeft size={17}/> В профиль
      </button>
      <header className="syrex-online-header">
        <div className="syrex-online-icon"><Users size={27}/></div>
        <div className="syrex-online-title">
          <h1>Игроки в сети</h1>
          <p>Кто сейчас на сайте Syrex или играет через клиент</p>
        </div>
        <div className="syrex-online-count">
          <strong>{count}</strong><span>онлайн</span>
        </div>
      </header>

      <div className="syrex-online-settings">
        <div className="syrex-online-setting">
          <span className="syrex-online-setting-icon"><Eye size={18}/></span>
          <span><strong>Показывать меня в сети</strong>
            <small>Другие пользователи Syrex увидят твой ник и активность</small></span>
          <button type="button" role="switch" aria-checked={visible}
            className={'syrex-online-switch' + (visible ? ' enabled' : '')}
            disabled={!!busy} onClick={() => toggle('presence', !visible)}>
            <span/>
          </button>
        </div>
        <div className="syrex-online-setting">
          <span className="syrex-online-setting-icon"><Server size={18}/></span>
          <span><strong>Показывать Minecraft-сервер</strong>
            <small>Адрес публичного сервера виден только авторизованным пользователям, если включить</small></span>
          <button type="button" role="switch" aria-checked={serverVisible}
            className={'syrex-online-switch' + (serverVisible ? ' enabled' : '')}
            disabled={!!busy} onClick={() => toggle('server', !serverVisible)}>
            <span/>
          </button>
        </div>
      </div>

      <div className="syrex-online-list-heading">
        <div><span className="syrex-online-live"/> Сейчас активны</div>
        <button type="button" onClick={reload} disabled={loading} aria-label="Обновить список">
          <RefreshCw size={16}/> Обновить
        </button>
      </div>
      <div className="syrex-online-list">
        {loading ? <div className="syrex-online-empty">Загружаем игроков…</div> :
          members.length ? members.map((member, idx) => <Member key={member.nickname + idx} member={member}/>) :
            <div className="syrex-online-empty">
              <EyeOff size={25}/> Сейчас нет пользователей с открытым статусом онлайн.
            </div>}
      </div>
      {error && <div className="syrex-online-error" role="alert">{error}</div>}
      <p className="syrex-online-foot">Статус пропадает автоматически при отсутствии активности. Minecraft-сервер виден только при включённой настройке. Локальные и частные адреса не публикуются.</p>
    </div>
  </main>;
}
