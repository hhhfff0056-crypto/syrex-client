import React, { useEffect, useRef, useState } from 'react';
import { Lock, Mail, KeyRound, Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { authConfigured, completeEmailRedirect, sendRecovery, signIn, updatePassword } from '../auth/supabaseAuth';
import GoogleRecaptcha, { captchaEnabled } from '../components/GoogleRecaptcha';
import './Login.css';
import './auth.css';

const Login = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState(() => new URLSearchParams(window.location.search).has('recover') ? 'recover' : 'login');
  const [captchaToken, setCaptchaToken] = useState('');
  const captchaRef = useRef(null);
  const [email, setEmail] = useState(() => new URLSearchParams(window.location.search).get('email') || '');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    completeEmailRedirect().then((result) => {
      if (!active || !result) return;
      if (result.isRecovery) {
        setMode('newPassword');
        setNotice('Укажите новый пароль для аккаунта.');
      } else {
        navigate('/profile', { replace: true });
      }
    }).catch((err) => {
      if (active) setError(err.message || 'Ссылка подтверждения недействительна.');
    });
    return () => { active = false; };
  }, [navigate]);

  const submit = async (event) => {
    event.preventDefault();
    if (working || !authConfigured) return;
    setError('');
    setNotice('');
    if (captchaEnabled && mode !== 'newPassword' && !captchaToken) {
      setError('Подтвердите, что вы не робот.');
      return;
    }
    setWorking(true);
    try {
      if (mode === 'recover') {
        if (!email.trim()) throw new Error('Введите email.');
        await sendRecovery(email, captchaToken);
        setNotice('Если аккаунт существует, письмо для восстановления отправлено. Проверьте почту.');
        setMode('login');
      } else if (mode === 'newPassword') {
        if (password.length < 8) throw new Error('Пароль должен содержать минимум 8 символов.');
        if (password !== repeat) throw new Error('Пароли не совпадают.');
        await updatePassword(password);
        setPassword('');
        setRepeat('');
        setNotice('Пароль изменён.');
        navigate('/profile', { replace: true });
      } else {
        if (!email.includes('@')) throw new Error('Вход выполняется по email.');
        await signIn(email, password, remember, captchaToken);
        navigate('/profile', { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Не удалось выполнить действие.');
    } finally {
      setWorking(false);
      setCaptchaToken('');
      captchaRef.current?.reset();
    }
  };

  const changeMode = (next) => {
    setMode(next);
    setError('');
    setNotice('');
    setPassword('');
    setRepeat('');
    setCaptchaToken('');
    captchaRef.current?.reset();
  };

  return (
    <motion.section className="login-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <div className="login-bg-glow" />
      <div className="container login-container">
        <div className="login-card glass-panel">
          <div className="login-header">
            <h2>{mode === 'recover' ? 'Восстановление пароля' : mode === 'newPassword' ? 'Новый пароль' : 'Вход в Syrex'}</h2>
            <p>{mode === 'login' ? 'Войдите в свой аккаунт' : 'Безопасное управление доступом к аккаунту'}</p>
          </div>
          {!authConfigured && <div className="auth-setup-note" role="status">Авторизация пока не подключена. Администратор сайта должен настроить сервер аккаунтов.</div>}
          <form className="login-form" onSubmit={submit}>
            {mode !== 'newPassword' && <label className="input-label">
              <span>Email</span>
              <div className="input-wrap">
                <Mail size={17} />
                <input type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} />
              </div>
            </label>}
            {mode !== 'recover' && <label className="input-label">
              <span>{mode === 'newPassword' ? 'Новый пароль' : 'Пароль'}</span>
              <div className="input-wrap">
                <Lock size={17} />
                <input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'newPassword' ? 'new-password' : 'current-password'} placeholder="Минимум 8 символов" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'newPassword' ? 8 : 1} />
                <button type="button" className="auth-eye-button" onClick={() => setShowPassword((p) => !p)} aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>}
            {mode === 'newPassword' && <label className="input-label">
              <span>Повторите новый пароль</span>
              <div className="input-wrap">
                <KeyRound size={17} />
                <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required minLength={8} />
              </div>
            </label>}
            {mode === 'login' && <div className="login-actions">
              <label className="remember">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span className="remember-box"><svg className="remember-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l2.5 2.5 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                <span className="remember-text">Запомнить меня</span>
              </label>
              <button className="auth-text-button" type="button" onClick={() => changeMode('recover')}>Забыли пароль?</button>
            </div>}
            {mode !== 'newPassword' && captchaEnabled &&
              <GoogleRecaptcha ref={captchaRef} onTokenChange={setCaptchaToken} />}
            {error && <div className="login-error" role="alert">{error}</div>}
            {notice && <div className="auth-success" role="status">{notice}</div>}
            <button className="btn-hero-primary login-submit" type="submit" disabled={!authConfigured || working || (captchaEnabled && mode !== 'newPassword' && !captchaToken)}>
              {working ? 'Проверяем...' : mode === 'recover' ? 'Отправить письмо' : mode === 'newPassword' ? 'Сохранить пароль' : 'Войти'}
            </button>
            <div className="login-footer">
              {mode === 'login' ? <><span>Нет аккаунта?</span><Link to="/register">Зарегистрироваться</Link></> :
                <button type="button" className="auth-text-button" onClick={() => changeMode('login')}>Вернуться ко входу</button>}
            </div>
          </form>
        </div>
      </div>
    </motion.section>
  );
};

export default Login;
