import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Check, Clock3, RefreshCw, Search, Send, Trash2,
  UserCheck, UserPlus, Users, Waypoints, X
} from 'lucide-react';
import { socialRequest } from '../services/socialApi';
import { getCurrentUser } from '../auth/supabaseAuth';
import './Friends.css';

function Person({ person, pending, sent, onAccept, onDecline, onRemove, busy }) {
  const pendingIncoming = pending && person.direction === 'incoming';
  return <article className="syrex-friend-person">
    <div className="syrex-friend-avatar">{person.nickname?.charAt(0)?.toUpperCase() || 'S'}</div>
    <div className="syrex-friend-text">
      <strong>{person.nickname}</strong>
      <small>UID {person.uid ?? '—'} {pending && ' · ' + (pendingIncoming ? 'Прислал заявку' : 'Ожидает ответа')}</small>
    </div>
    <div className="syrex-friend-buttons">
      {pendingIncoming && <>
        <button className="syrex-friend-accept" type="button" onClick={onAccept} disabled={busy} title="Принять"><Check size={17}/> Принять</button>
        <button className="syrex-friend-remove" type="button" onClick={onDecline} disabled={busy} title="Отклонить"><X size={17}/></button>
      </>}
      {!pendingIncoming && <button className="syrex-friend-remove" type="button" onClick={onRemove} disabled={busy}>
        <Trash2 size={16}/> {pending ? 'Отменить' : 'Удалить'}
      </button>}
    </div>
  </article>;
}

export default function Friends() {
  const navigate = useNavigate();
  const [friends, setFriends] = useState([]);
  const [party, setParty] = useState(null);
  const [partyInvites, setPartyInvites] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('friends');

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await socialRequest('list');
      setFriends(data.friends || []);
      socialRequest('party-status').then(group => {
        setParty(group.party || null);
        setPartyInvites(group.invites || []);
      }).catch(() => {});
      setError('');
    } catch (e) {
      if (!quiet) setError(e.message || 'Ошибка загрузки друзей.');
    } finally { if (!quiet) setLoading(false); }
  };

  useEffect(() => {
    let closed = false;
    getCurrentUser().then(user => {
      if (closed) return;
      if (!user) navigate('/login', { replace: true });
      else load();
    }).catch(() => { if (!closed) navigate('/login', { replace: true }); });
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load(true);
    }, 30000);
    return () => { closed = true; clearInterval(timer); };
  }, [navigate]);

  const accepted = useMemo(() => friends.filter(x => x.status === 'accepted'), [friends]);
  const pending = useMemo(() => friends.filter(x => x.status === 'pending'), [friends]);
  const incoming = pending.filter(x => x.direction === 'incoming');

  const search = async event => {
    event.preventDefault();
    if (busy || searching) return;
    setSearching(true); setError(''); setMessage('');
    try {
      const data = await socialRequest('search', { query: query.trim() });
      setResults(data.users || []);
      if (!data.users?.length) setMessage('Игрок не найден. Проверь никнейм или числовой UID.');
    } catch (e) { setError(e.message || 'Ошибка поиска.'); }
    finally { setSearching(false); }
  };

  const act = async (action, args = {}, note) => {
    if (busy) return;
    setBusy(true); setMessage(''); setError('');
    try {
      await socialRequest(action, args);
      await load(true);
      setResults([]);
      setMessage(note);
    } catch (e) { setError(e.message || 'Не удалось выполнить операцию.'); }
    finally { setBusy(false); }
  };

  return <main className="syrex-friends-page">
    <div className="syrex-friends-container">
      <button className="syrex-friends-back" type="button" onClick={() => navigate('/profile')}>
        <ArrowLeft size={17}/> Личный кабинет
      </button>
      <header className="syrex-friends-header">
        <div className="syrex-friends-logo"><Users size={27}/></div>
        <div className="syrex-friends-heading">
          <h1>Друзья Syrex</h1>
          <p>Добавляй друзей на сайте и отправляй им игровые метки по клавише</p>
        </div>
        <div className="syrex-friends-count"><strong>{accepted.length}</strong><span>друзей</span></div>
      </header>

      <div className="syrex-friends-search-panel">
        <h2><UserPlus size={20}/> Добавить друга</h2>
        <form onSubmit={search} className="syrex-friends-search-form">
          <label className="syrex-friends-search">
            <Search size={17}/>
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Никнейм Syrex или UID" minLength={1} maxLength={32}
              aria-label="Поиск друга по нику или UID"/>
          </label>
          <button disabled={searching || busy || query.trim().length < 1} type="submit">
            <Search size={16}/>{searching ? 'Поиск…' : 'Найти'}
          </button>
        </form>
        {results.map(person => <div className="syrex-friends-result" key={person.uid ?? person.nickname}>
          <div className="syrex-friend-avatar">{person.nickname.charAt(0).toUpperCase()}</div>
          <div className="syrex-friend-text">
            <strong>{person.nickname}</strong><small>UID {person.uid ?? '—'}</small>
          </div>
          <button type="button" disabled={busy || !person.uid || Boolean(person.status)}
            onClick={() => act('request', { uid: person.uid }, 'Заявка в друзья отправлена.')}
            className="syrex-friend-accept">
            {person.status ? <><Clock3 size={15}/> Уже добавлен</> : <><UserPlus size={15}/> Добавить</>}
          </button>
        </div>)}
      </div>

      <div className="syrex-friends-tabs" role="tablist" aria-label="Список друзей">
        <button role="tab" aria-selected={tab === 'friends'} className={tab === 'friends' ? 'active' : ''}
          onClick={() => setTab('friends')}><UserCheck size={17}/> Друзья ({accepted.length})</button>
        <button role="tab" aria-selected={tab === 'pending'} className={tab === 'pending' ? 'active' : ''}
          onClick={() => setTab('pending')}><Clock3 size={17}/> Заявки ({pending.length}) {incoming.length > 0 && <i/>}</button>
        <button className="syrex-friends-refresh" type="button" onClick={() => load()} disabled={loading}><RefreshCw size={16}/></button>
      </div>
      <section className="syrex-friends-list">
        {loading ? <p className="syrex-friends-empty">Загружаем список друзей…</p> :
          (tab === 'friends' ? accepted : pending).length
            ? (tab === 'friends' ? accepted : pending).map(person =>
              <Person key={person.uid || person.nickname} person={person} pending={tab === 'pending'}
                onAccept={() => act('respond', { uid: person.uid, decision: 'accept' }, 'Игрок добавлен в друзья.')}
                onDecline={() => act('respond', { uid: person.uid, decision: 'reject' }, 'Заявка отклонена.')}
                onRemove={() => act('remove', { uid: person.uid }, 'Изменения сохранены.')} busy={busy}/>)
            : <p className="syrex-friends-empty">{tab === 'friends'
              ? 'Пока друзей нет. Найди игрока по нику или UID и отправь заявку.'
              : 'Новых заявок пока нет.'}</p>}
      </section>
      {error && <p className="syrex-friends-error" role="alert">{error}</p>}
      {message && <p className="syrex-friends-success" role="status">{message}</p>}
      <section className="syrex-party-panel">
        <h2><Users size={19}/> Моя Party <span>{party ? party.members.length : 0}/6</span></h2>
        {party ? <div className="syrex-party-members">
          {(party.members || []).map(member => <span key={member.nickname} className="syrex-party-pill">
            <span className="syrex-party-dot"/> {member.nickname}
            {member.me && ' (вы)'} {member.leader && ' · Лидер'}
          </span>)}
        </div> : <p>Пати ещё не создано. В Minecraft введи <code>.party НикДруга</code>, чтобы отправить приглашение.</p>}
        {partyInvites.map((invite, index) => <div className="syrex-party-invite" key={invite.from + index}>
          <strong>{invite.from} приглашает в пати</strong>
          <button type="button" disabled={busy} onClick={() => act('party-accept', {}, 'Вы вступили в пати.')}>Принять</button>
          <button type="button" disabled={busy} onClick={() => act('party-decline', {}, 'Приглашение отклонено.')}>Отклонить</button>
        </div>)}
        <p>В игре: <code>.party НикДруга</code> — пригласить, <code>.party accept</code> — принять,
          <code>.party list</code> — состав, <code>.party leave</code> — выйти.
          Метки видны только друзьям из пати на одном сервере и в одном измерении.</p>
      </section>
      <aside className="syrex-friends-tip">
        <img src={import.meta.env.BASE_URL + 'friends/waypoint.png'} width="52" height="52"
          alt="Жёлтая PNG-метка Syrex" className="syrex-friends-waypoint-preview"/>
        <div><strong>Минималистичные метки Party</strong>
        <p>В Minecraft 1.21.11 включи Visuals → Friend Pings и назначь клавишу «Метка в пати» (по умолчанию P).
          Наведи прицел на блок и нажми её. У участников твоей пати появится маленький жёлтый пин,
          а над ним — ник, координаты X/Y/Z и расстояние в метрах. Метка исчезнет через две минуты.
          Игровые координаты передаются только после нажатия клавиши.</p></div>
      </aside>
    </div>
  </main>;
}
