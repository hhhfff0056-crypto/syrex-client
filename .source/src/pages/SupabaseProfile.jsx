import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Download, LogOut, Mail, ShieldCheck, User, UserCircle, KeyRound, Sparkles, Users } from 'lucide-react';
import { getCurrentUser, signOut } from '../auth/supabaseAuth';
import { getAuthItem, setAuthItemAuto } from '../utils/authStorage';
import { downloadFreeClient, downloadLicensedClient, getLicenseStatus, markSiteOffline } from '../services/licenseApi';
import { getDeviceStatus } from '../services/deviceApi';
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
  const [license, setLicense] = useState(null);
  const [device, setDevice] = useState(null);
  const [deviceError, setDeviceError] = useState('');
  const [downloading, setDownloading] = useState('');

  useEffect(() => {
    let active = true;
    getCurrentUser().then((user) => {
      if (!active) return;
      if (!user) {
        navigate('/login', { replace: true });
        return;
      }
      setAccount(user);
      setAuthItemAuto('authUser', String(user.app_metadata?.role || 'DEFAULT'));
      getLicenseStatus().then((state) => { if (active) setLicense(state); }).catch((err) => { if (active) setError(err.message); });
      getDeviceStatus().then((state) => { if (active) setDevice(state); }).catch((err) => { if (active) setDeviceError(err.message); });
    }).catch((err) => {
      if (active) setError(err.message || 'Не удалось проверить аккаунт.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [navigate]);

  const logout = async () => {
    try { await markSiteOffline(); } catch { /* Heartbeat expiry is the fallback. */ }
    await signOut();
    navigate('/', { replace: true });
  };

  const download = async (edition) => {
    if (downloading || !license) return;
    const premium = edition === 'premium';
    if (premium && !license.active) {
      navigate('/keys');
      return;
    }
    const available = premium
      ? (license.premiumFileReady ?? license.fileReady)
      : license.freeFileReady;
    if (!available) return;
    setDownloading(edition);
    setError('');
    try {
      if (premium) await downloadLicensedClient();
      else await downloadFreeClient();
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading('');
    }
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
  const accountRole = String(account?.app_metadata?.role || 'USER').toUpperCase();
  const canManageUsers = ['ADMIN', 'DEV', 'DEVELOPER'].includes(accountRole);
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
                <div className="profile-uid" aria-label="Числовой UID аккаунта">UID: {license?.uid ?? '…'}</div>
                <div className="profile-tags">
                  <span className={`tag-pill role-badge ${accountRole === 'DEV' ? 'dev-role' : ''}`}><ShieldCheck size={13} /> {accountRole}</span>
                  <span className="tag-pill"><ShieldCheck size={13} /> Аккаунт подтверждён</span>
                  <span className="tag-pill muted">{license?.active
                    ? license.isDeveloper ? 'Версия: Premium · DEV' : license.expiresAt ? 'Premium до ' + new Date(license.expiresAt).toLocaleDateString('ru-RU') : 'Premium навсегда'
                    : 'Версия: Free — без подписки'}</span>
                </div>
                <div className="profile-editions" aria-label="Скачать клиент Syrex">
                  <div className="profile-edition profile-edition-free">
                    <div className="profile-edition-heading"><span>FREE</span><small>Бесплатная версия</small></div>
                    <button
                      className="btn-trial admin-btn download-btn profile-action-btn profile-edition-button"
                      type="button"
                      onClick={() => download('free')}
                      disabled={!!downloading || !license?.freeFileReady}
                    >
                      <Download size={16} /> {downloading === 'free' ? 'Получаем Free…' : 'Скачать Free'}
                    </button>
                    {license && !license.freeFileReady && <small className="profile-edition-hint">Файл Free пока недоступен.</small>}
                  </div>
                  <div className="profile-edition profile-edition-premium">
                    <div className="profile-edition-heading"><span>PREMIUM</span><small>{license?.active ? 'Подписка активна' : 'Требуется подписка'}</small></div>
                    <button
                      className="btn-trial admin-btn download-btn profile-action-btn profile-edition-button"
                      type="button"
                      onClick={() => download('premium')}
                      disabled={!!downloading || !license || (license.active && !(license.premiumFileReady ?? license.fileReady))}
                    >
                      <Download size={16} /> {downloading === 'premium' ? 'Получаем Premium…' : 'Скачать Premium'}
                    </button>
                    {!license?.active && <small className="profile-edition-hint">Нажмите, чтобы активировать ключ.</small>}
                    {license?.active && !(license.premiumFileReady ?? license.fileReady) && <small className="profile-edition-hint">Файл Premium пока не загружен.</small>}
                  </div>
                </div>
                {canManageUsers && <button className="btn-trial admin-btn profile-action-btn" type="button" onClick={() => navigate('/admin')}><ShieldCheck size={16} /> Управление пользователями</button>}
                <button className="btn-trial admin-btn profile-action-btn" type="button" onClick={() => navigate('/cosmetics')}><Sparkles size={16} /> Моя косметика</button>
                <button className="btn-trial admin-btn profile-action-btn" type="button" onClick={() => navigate('/online')}><Users size={16} /> Кто сейчас в сети</button>
                <button className="btn-trial admin-btn profile-action-btn" type="button" onClick={() => navigate('/keys')}>
                  <KeyRound size={16} /> {accountRole === 'DEV' ? 'Управление ключами' : license?.active ? 'Моя лицензия Premium' : 'Перейти на Premium'}
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
                  <div className="profile-row"><span><ShieldCheck size={14} /> Роль</span><strong>{accountRole}</strong></div>
                  <div className="profile-row"><span><Calendar size={14} /> Дата регистрации</span><strong>{joinedAt}</strong></div>
                  <div className="profile-row"><span><ShieldCheck size={14} /> Привязка HWID</span><strong>{device ? device.bound ? "Привязан" : "Не привязан" : "Проверяем…"}</strong></div>
                  {device?.boundAt && <div className="profile-row"><span><Calendar size={14} /> Дата привязки</span><strong>{new Date(device.boundAt).toLocaleDateString("ru-RU")}</strong></div>}
                </div>
                <p className="auth-profile-hint">При первом входе в клиент HWID обязательно привязывается к аккаунту. Перед входом клиент сообщает об этом. Сервер хранит только защищённый отпечаток устройства, а не серийные номера. При смене компьютера обратитесь в поддержку для сброса. Free доступен без подписки, Premium — по активному ключу.</p>
                {deviceError && <p className="auth-profile-hint" role="status">Статус HWID недоступен: {deviceError}</p>}
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
