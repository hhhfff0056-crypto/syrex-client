import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import './SyrexCaptcha.css';

// Challenge and answer are verified in a Supabase Edge Function, never in this bundle.
const baseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
const endpoint = baseUrl + '/functions/v1/syrex-captcha';

async function readChallenge(mode, signal) {
  const response = await fetch(endpoint + '?mode=' + mode, {
    headers: { apikey: key },
    cache: 'no-store',
    signal
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Проверка недоступна. Обновите страницу.');
  return body;
}

export const useCaptchaStatus = () => {
  const [status, setStatus] = useState('checking');
  useEffect(() => {
    const controller = new AbortController();
    readChallenge('status', controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setStatus(result.ready ? 'ready' : 'error');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, []);
  return status;
};

const SyrexCaptcha = forwardRef(function SyrexCaptcha({ onTokenChange }, ref) {
  const callback = useRef(onTokenChange);
  const sequence = useRef(0);
  const [challenge, setChallenge] = useState(null);
  const [answer, setAnswer] = useState('');
  const [state, setState] = useState('loading');
  callback.current = onTokenChange;

  const newChallenge = useCallback(async () => {
    const seq = ++sequence.current;
    callback.current('');
    setChallenge(null);
    setAnswer('');
    setState('loading');
    try {
      const next = await readChallenge('challenge');
      if (seq !== sequence.current) return;
      if (!next.nonce || !next.signature || !next.question) throw new Error('Empty challenge');
      setChallenge(next);
      setState('ready');
    } catch {
      if (seq === sequence.current) setState('error');
    }
  }, []);

  useImperativeHandle(ref, () => ({ reset: newChallenge }), [newChallenge]);

  useEffect(() => {
    newChallenge();
    return () => { sequence.current += 1; };
  }, [newChallenge]);

  const changeAnswer = (value) => {
    if (!/^\d{0,2}$/.test(value)) return;
    setAnswer(value);
    callback.current(value && challenge
      ? JSON.stringify({
          nonce: challenge.nonce,
          expiresAt: challenge.expiresAt,
          signature: challenge.signature,
          answer: Number(value)
        })
      : '');
  };

  return (
    <div className="syrex-captcha" aria-label="Капча Syrex">
      <div className="syrex-captcha-heading"><ShieldCheck size={17} /><span>Проверка безопасности</span></div>
      {state === 'ready' && challenge ? (
        <div className="syrex-captcha-body">
          <div className="syrex-captcha-question" aria-label={'Сколько будет ' + challenge.question}>{challenge.question}</div>
          <label className="syrex-captcha-answer">
            <span>Ответ</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={2}
              placeholder="?"
              aria-label="Ответ на пример"
              value={answer}
              onChange={(event) => changeAnswer(event.target.value)}
            />
          </label>
          <button type="button" className="syrex-captcha-refresh" onClick={newChallenge} title="Другой пример" aria-label="Обновить пример"><RefreshCw size={17} /></button>
        </div>
      ) : (
        <div className="syrex-captcha-loading" role="status">{state === 'error' ? 'Не удалось загрузить пример' : 'Загружаем проверку…'}</div>
      )}
      {state === 'error' && <button type="button" className="syrex-captcha-retry" onClick={newChallenge}>Повторить</button>}
      <div className="syrex-captcha-note">Решите пример, чтобы продолжить. Проверка действует 2 минуты.</div>
    </div>
  );
});
export default SyrexCaptcha;
