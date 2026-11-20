import React, { useCallback, useEffect, useState } from 'react';
import './BrowserCheck.css';

// The check is a real round-trip to a Supabase Edge Function. The server signs
// the challenge and verifies the answer; this is not a fake timed splash page.
// GitHub Pages is static: JavaScript gates cannot stop an HTTP-level DDoS.
const baseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
const endpoint = baseUrl + '/functions/v1/syrex-captcha';
const MAX_SOLUTIONS = 250_000;

async function gateRequest(mode, payload, signal) {
  if (!baseUrl.startsWith('https://') || !publishableKey) {
    throw new Error('Сервер проверки не настроен.');
  }
  const response = await fetch(endpoint + '?mode=' + mode, {
    method: payload ? 'POST' : 'GET',
    headers: {
      apikey: publishableKey,
      ...(payload ? { 'Content-Type': 'application/json' } : {})
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    cache: 'no-store',
    signal
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(response.status === 429
      ? 'Слишком много запросов. Попробуйте позже.'
      : 'Сервер проверки временно недоступен.');
  }
  return data;
}

async function solveChallenge(nonce, signal) {
  if (!window.crypto?.subtle || !/^[0-9a-f-]{36}$/i.test(nonce)) {
    throw new Error('Браузер не поддерживает безопасную проверку.');
  }
  const encoder = new TextEncoder();
  for (let solution = 0; solution <= MAX_SOLUTIONS; solution += 1) {
    if (signal.aborted) throw new Error('Проверка прервана.');
    const bytes = encoder.encode('syrex-browser-v1-proof:' + nonce + ':' + solution);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    // 12 leading zero bits. Do not reduce the server-validated difficulty.
    if (digest[0] === 0 && (digest[1] & 0xf0) === 0) return solution;
    // Let the UI animate and keep mobile devices responsive.
    if ((solution & 255) === 255) {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }
  throw new Error('Не удалось завершить проверку. Повторите попытку.');
}

function BrowserCheck({ onVerified }) {
  const [phase, setPhase] = useState('checking');
  const [step, setStep] = useState('Подключение к серверу защиты...');
  const [requestId, setRequestId] = useState('—');
  const [retryCount, setRetryCount] = useState(0);
  const [problem, setProblem] = useState('');
  const [publicIp, setPublicIp] = useState('Определяется...');
  const [ipVisible, setIpVisible] = useState(false);
  const onComplete = useCallback(() => onVerified(), [onVerified]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('https://api64.ipify.org?format=json', {
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    })
      .then((response) => {
        if (!response.ok) throw new Error('IP lookup failed');
        return response.json();
      })
      .then(({ ip }) => {
        const address = typeof ip === 'string' ? ip.trim() : '';
        if (!/^[0-9a-fA-F:.]{3,45}$/.test(address)) throw new Error('Invalid IP');
        if (!controller.signal.aborted) setPublicIp(address);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPublicIp('Недоступен');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 25_000);
    setPhase('checking');
    setProblem('');
    setRequestId('—');
    setStep('Подключение к серверу защиты...');

    const check = async () => {
      try {
        const challenge = await gateRequest('browser-challenge', null, controller.signal);
        if (!active) return;
        if (!/^[0-9a-f-]{36}$/i.test(challenge.nonce || '') ||
            challenge.difficultyBits !== 12 ||
            typeof challenge.signature !== 'string' ||
            !Number.isSafeInteger(challenge.expiresAt)) {
          throw new Error('Некорректное задание от сервера.');
        }
        setRequestId(challenge.nonce.slice(0, 8).toUpperCase());
        setStep('Идёт автоматическая проверка браузера...');
        const solution = await solveChallenge(challenge.nonce, controller.signal);
        setStep('Подтверждаем результат на сервере...');
        const result = await gateRequest('browser-verify', {
          nonce: challenge.nonce,
          expiresAt: challenge.expiresAt,
          signature: challenge.signature,
          solution
        }, controller.signal);
        if (!result.verified) throw new Error('Браузер не прошёл проверку.');
        if (!active || controller.signal.aborted) return;
        window.clearTimeout(timeout);
        setPhase('success');
        setStep('Проверка успешно пройдена');
        // Show a short confirmation only after actual server verification.
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        if (active) onComplete();
      } catch (error) {
        if (!active) return;
        window.clearTimeout(timeout);
        setPhase('error');
        setProblem(controller.signal.aborted
          ? 'Превышено время ожидания сервера. Проверьте подключение и повторите.'
          : error?.message || 'Не удалось проверить браузер.');
      }
    };
    check();
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [retryCount, onComplete]);

  const retry = () => setRetryCount((value) => value + 1);
  const continueToSite = () => onComplete();
  const utc = new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  const host = window.location.hostname === 'localhost' ? 'Syrex Client' : window.location.hostname;

  return (
    <div className="syrex-browser-guard" role="region" aria-label="Проверка браузера Syrex">
      <div className="syrex-guard-brand"><span className="syrex-guard-brand-mark">S</span> SYREX GUARD</div>
      <div className="syrex-guard-content" aria-live="polite">
        <h1>Проверка браузера перед переходом на <strong>{host}</strong></h1>
        <p>{phase === 'success'
          ? 'Браузер подтверждён. Открываем Syrex Client.'
          : phase === 'error'
            ? problem
            : 'Подождите несколько секунд — после проверки сайт откроется автоматически.'}</p>
        <div className="syrex-guard-indicator">
          {phase === 'error'
            ? <span className="syrex-guard-error-icon" aria-hidden="true">!</span>
            : phase === 'success'
              ? <span className="syrex-guard-done-icon" aria-hidden="true">✓</span>
              : <span className="syrex-guard-spinner" aria-hidden="true" />}
        </div>
        <div className="syrex-guard-step">{phase === 'error' ? 'Проверка не завершена' : step}</div>
        {phase === 'error' && <div className="syrex-guard-actions"><button type="button" className="syrex-guard-retry" onClick={retry}>Повторить проверку</button><button type="button" className="syrex-guard-retry" onClick={continueToSite}>Открыть сайт</button></div>}
      </div>
      <div className="syrex-guard-metadata" aria-label="Данные проверки">
        <div><span>Request ID:</span> <strong>{requestId}</strong></div>
        <div><span>Time:</span> <strong>{utc}</strong></div>
        <div><span>IP:</span> <strong><button
          type="button"
          className="syrex-guard-ip-toggle"
          data-revealed={ipVisible ? 'true' : 'false'}
          aria-label={ipVisible ? 'Скрыть IP-адрес' : 'Показать IP-адрес'}
          aria-pressed={ipVisible}
          title={ipVisible ? 'Нажмите, чтобы скрыть IP' : 'Нажмите, чтобы показать IP'}
          onClick={() => setIpVisible((value) => !value)}
        ><span className="syrex-guard-ip-value">{publicIp}</span></button></strong></div>
      </div>
    </div>
  );
}

export default BrowserCheck;
