import React, { useRef, useState } from 'react';
import { Lock, Mail, User, Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { authConfigured, register as registerAccount } from '../auth/supabaseAuth';
import GoogleRecaptcha, { useCaptchaStatus } from '../components/GoogleRecaptcha';
import './Login.css';
import './auth.css';

const Register = () => {
  const navigate = useNavigate();
  const captchaStatus = useCaptchaStatus();
  const captchaEnabled = captchaStatus === 'ready';
  const captchaUnavailable = captchaStatus === 'checking' || captchaStatus === 'error';
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const captchaRef = useRef(null);

  const submit = async (event) => {
    event.preventDefault();
    if (!authConfigured || working) return;
    if (captchaUnavailable) {
      setError('Проверка reCAPTCHA недоступна. Обновите страницу.');
      return;
    }
    setError('');
    setNotice('');
    if (username.trim().length < 3) return setError('Никнейм должен содержать минимум 3 символа.');
    if (password.length < 8) return setError('Пароль должен содержать минимум 8 символов.');
    if (password !== repeat) return setError('Пароли не совпадают.');
    if (captchaEnabled && !captchaToken) return setError('Подтвердите, что вы не робот.');
    setWorking(true);
    try {
      const result = await registerAccount(username, email, password, captchaToken);
      setPassword('');
      setRepeat('');
      if (result.needsConfirmation) {
        setNotice('Проверьте почту и подтвердите email по ссылке. После этого войдите в аккаунт.');
      } else {
        navigate('/profile', { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Не удалось создать аккаунт.');
    } finally {
      setWorking(false);
      setCaptchaToken('');
      captchaRef.current?.reset();
    }
  };

  return (
    <motion.section className="login-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <div className="login-bg-glow" />
      <div className="container login-container">
        <div className="login-card glass-panel">
          <div className="login-header">
            <h2>Создать аккаунт</h2>
            <p>Регистрация в Syrex Client</p>
          </div>
          {!authConfigured && <div className="auth-setup-note" role="status">Регистрация пока недоступна. Администратор сайта должен подключить сервер аккаунтов.</div>}
          <form className="login-form" onSubmit={submit}>
            <label className="input-label">
              <span>Никнейм</span>
              <div className="input-wrap">
                <User size={17} />
                <input value={username} onChange={(e) => setUsername(e.target.value)} type="text" autoComplete="username" minLength={3} maxLength={32} required placeholder="Ваш никнейм" />
              </div>
            </label>
            <label className="input-label">
              <span>Email</span>
              <div className="input-wrap">
                <Mail size={17} />
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" maxLength={254} required placeholder="name@example.com" />
              </div>
            </label>
            <label className="input-label">
              <span>Пароль</span>
              <div className="input-wrap">
                <Lock size={17} />
                <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required placeholder="Минимум 8 символов" />
                <button type="button" className="auth-eye-button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            <label className="input-label">
              <span>Повторите пароль</span>
              <div className="input-wrap">
                <Lock size={17} />
                <input value={repeat} onChange={(e) => setRepeat(e.target.value)} type="password" autoComplete="new-password" minLength={8} required />
              </div>
            </label>
            {captchaEnabled && <GoogleRecaptcha ref={captchaRef} onTokenChange={setCaptchaToken} />}
            {captchaStatus === 'error' && <div className="login-error" role="alert">Не удалось связаться с сервером проверки reCAPTCHA.</div>}
            {error && <div className="login-error" role="alert">{error}</div>}
            {notice && <div className="auth-success" role="status">{notice}</div>}
            <button className="btn-hero-primary login-submit" type="submit" disabled={!authConfigured || working || !!notice || captchaUnavailable || (captchaEnabled && !captchaToken)}>{working ? 'Создаём...' : 'Зарегистрироваться'}</button>
            <div className="login-footer">
              <span>Уже есть аккаунт?</span>
              <Link to="/login">Войти</Link>
            </div>
          </form>
        </div>
      </div>
    </motion.section>
  );
};

export default Register;
