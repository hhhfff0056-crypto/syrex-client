import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Download, LogOut, Mail, ShieldCheck, User, UserCircle, KeyRound } from 'lucide-react';
import { getCurrentUser, signOut } from '../auth/supabaseAuth';
import { getAuthItem, setAuthItemAuto } from '../utils/authStorage';
import './Profile.css';
import './SupabaseProfile.css';

const SupabaseProfile = () => {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [avatar, setAvatar] = useState(() => getAuthItem('avatarDataUrl') || '');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getCurrentUser().then((user) => {
      if (!active) return;
      if (!user) {
        navigate('/login', { replace: true });
        return;
      }
      setAccount(user);
    }).catch((err) => {
      if (active) setError(err.message || 'Не удалось проверить аккаунт.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [navigate]);

  const logout = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  const askReset = () => {
    if (!account?.email) return;
    navigate('/login?recover=1&email=' + encodeURIComponent(account.email));
  };

  const selectAvatar = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 700000) {
      setError('Используйте изображение размером не больше 700 КБ.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        try {
          setAuthItemAuto('avatarDataUrl', reader.result);
          setAvatar(reader.result);
          setError('');
        } catch {
          setError('Не удалось сохранить аватар на этом устройстве.');
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const displayName = account?.user_metadata?.username || account?.email?.split('@')[0] || 'User';
  const joinedAt = account?.created_at ? new Date(account.created_at).toLocaleDateString('ru-RU') : '—';

  return (
    <motion.section className="profile-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <div className="profile-bg-grid" />
      <div className="profile-bg-glow" />
      <div className="container profile-container">
        <div className="profile-card">
          {loading ? <div className="auth-profile-state">Проверяем вход...</div> : !account ? (
            <div className="auth-profile-state">
              <h2>Не удалось загрузить аккаунт</h2>
              <p>{error || 'Войдите повторно.'}</p>
              <button className="btn-hero-primary" type="button" onClick={() => navigate('/login')}>Перейти ко входу</button>
            </div>
          ) : (
            <div className="profile-layout">
              <div className="profile-left">
                <button type="button" className="profile-avatar auth-avatar-button" onClick={() => fileRef.current?.click()} title="Поменять аватар">
                  {avatar ? <img src={avatar} alt="Аватар" /> : <User size={36} />}
                  <div className="avatar-overlay">Изменить</div>
                </button>
                <input ref={fileRef} className="avatar-input" type="file" accept="image/*" onChange={selectAvatar} />
                <div className="profile-title">
                  <h2>{displayName}</h2>
                  <div className="profile-sub">{account.email}</div>
                </div>
                <div className="profile-uid">UID: {account.id}</div>
                <div className="profile-tags">
                  <span className="tag-pill"><ShieldCheck size={13} /> Аккаунт подтверждён</span>
                  <span className="tag-pill muted">Подписка: не подключена</span>
                </div>
                <button className="btn-trial admin-btn download-btn profile-action-btn" type="button" disabled title="Для скачивания нужен сервер подписок">
                  <Download size={16} /> Скачать клиент
                </button>
                <button className="btn-trial admin-btn profile-action-btn" type="button" onClick={askReset} disabled={busy}>
                  <KeyRound size={16} /> {busy ? 'Отправляем...' : 'Сменить пароль'}
                </button>
                <button className="btn-trial admin-btn profile-action-btn" type="button" onClick={logout}>
                  <LogOut size={16} /> Выйти
                </button>
              </div>
              <div className="profile-right">
                <div className="profile-section-title">Данные аккаунта</div>
                <div className="profile-list">
                  <div className="profile-row"><span><UserCircle size={14} /> Никнейм</span><strong>{displayName}</strong></div>
                  <div className="profile-row"><span><Mail size={14} /> Email</span><strong>{account.email}</strong></div>
                  <div className="profile-row"><span><Calendar size={14} /> Дата регистрации</span><strong>{joinedAt}</strong></div>
                </div>
                <p className="auth-profile-hint">Аккаунт работает через Supabase Auth. Подписки, ключи и загрузки будут доступны после подключения серверной части Syrex. Аватар пока хранится только в этом браузере.</p>
                {error && <div className="login-error" role="alert">{error}</div>}
                {notice && <div className="auth-success" role="status">{notice}</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
};
export default SupabaseProfile;
