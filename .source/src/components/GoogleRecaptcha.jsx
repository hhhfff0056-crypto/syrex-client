import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import ReCAPTCHA from 'react-google-recaptcha';
import './GoogleRecaptcha.css';

// The site key is public. Never expose the Google reCAPTCHA secret key here.
export const recaptchaSiteKey = (import.meta.env.VITE_RECAPTCHA_SITE_KEY || '').trim();
export const captchaEnabled = Boolean(recaptchaSiteKey);

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
