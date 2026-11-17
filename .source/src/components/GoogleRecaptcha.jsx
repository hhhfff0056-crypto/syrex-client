import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import ReCAPTCHA from 'react-google-recaptcha';
import './GoogleRecaptcha.css';

// The site key is public. Never expose the Google reCAPTCHA secret key here.
export const recaptchaSiteKey = (import.meta.env.VITE_RECAPTCHA_SITE_KEY || '').trim();
export const captchaEnabled = Boolean(recaptchaSiteKey);

export const useCaptchaStatus = () => {
  const [status, setStatus] = useState(captchaEnabled ? 'checking' : 'off');

  useEffect(() => {
    if (!captchaEnabled) return;
    const controller = new AbortController();
    const baseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
    const apiKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
    fetch(baseUrl + '/functions/v1/verify-recaptcha', {
      headers: { apikey: apiKey },
      signal: controller.signal,
      cache: 'no-store'
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('CAPTCHA readiness check failed');
        return response.json();
      })
      .then((result) => {
        if (!controller.signal.aborted) setStatus(result.ready === true ? 'ready' : 'off');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, []);

  return status;
};

const GoogleRecaptcha = forwardRef(function GoogleRecaptcha({ onTokenChange }, ref) {
  const captchaRef = useRef(null);
  useImperativeHandle(ref, () => ({
    reset() {
      onTokenChange('');
      captchaRef.current?.reset();
    }
  }), [onTokenChange]);

  if (!captchaEnabled) return null;

  return (
    <div className="auth-captcha" aria-label="Проверка Google reCAPTCHA">
      <ReCAPTCHA
        ref={captchaRef}
        sitekey={recaptchaSiteKey}
        size="normal"
        theme="dark"
        onChange={(token) => onTokenChange(token || '')}
        onExpired={() => onTokenChange('')}
        onErrored={() => onTokenChange('')}
      />
    </div>
  );
});

export default GoogleRecaptcha;
