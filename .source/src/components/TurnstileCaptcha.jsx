import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import './TurnstileCaptcha.css';

// Only a public site key goes to the browser. The secret key belongs exclusively in Supabase.
export const turnstileSiteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();
export const captchaEnabled = Boolean(turnstileSiteKey);

let scriptPromise = null;
const ensureTurnstile = () => {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('Turnstile не загрузился.'));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error('Не удалось загрузить CAPTCHA. Отключите блокировщик и обновите страницу.'));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
};

const TurnstileCaptcha = forwardRef(function TurnstileCaptcha({ onTokenChange }, ref) {
  const container = useRef(null);
  const widgetId = useRef(null);
  const latestCallback = useRef(onTokenChange);
  const [error, setError] = useState('');

  latestCallback.current = onTokenChange;

  useImperativeHandle(ref, () => ({
    reset() {
      latestCallback.current('');
      if (widgetId.current !== null && window.turnstile) {
        try { window.turnstile.reset(widgetId.current); } catch { /* already unmounted */ }
      }
    }
  }), []);

  useEffect(() => {
    if (!captchaEnabled) return;
    let mounted = true;
    ensureTurnstile().then((api) => {
      if (!mounted || !container.current) return;
      widgetId.current = api.render(container.current, {
        sitekey: turnstileSiteKey,
        theme: 'auto',
        callback: (token) => {
          if (mounted) {
            setError('');
            latestCallback.current(token);
          }
        },
        'expired-callback': () => {
          if (mounted) latestCallback.current('');
        },
        'error-callback': () => {
          if (mounted) {
            latestCallback.current('');
            setError('Ошибка проверки. Обновите страницу и попробуйте ещё раз.');
          }
        }
      });
    }).catch((err) => {
      if (mounted) {
        latestCallback.current('');
        setError(err.message || 'CAPTCHA временно недоступна.');
      }
    });
    return () => {
      mounted = false;
      latestCallback.current('');
      if (widgetId.current !== null && window.turnstile) {
        try { window.turnstile.remove(widgetId.current); } catch { /* widget already removed */ }
      }
      widgetId.current = null;
    };
  }, []);

  if (!captchaEnabled) return null;
  return (
    <div className="auth-captcha" aria-label="Проверка от ботов">
      <div ref={container} className="auth-captcha-widget" />
      {error && <div className="login-error" role="alert">{error}</div>}
    </div>
  );
});

export default TurnstileCaptcha;
