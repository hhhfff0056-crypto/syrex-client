import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, ShieldCheck, Download, Copy, RefreshCw, Settings2, ArrowLeft, CheckCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { downloadLicensedClient, getLicenseStatus, licenseRequest, redeemLicenseKey } from '../services/licenseApi';
import './Keys.css';

const formatDate = (date) => date ? new Date(date).toLocaleDateString('ru-RU') : 'Навсегда';

const Keys = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [count, setCount] = useState(1);
  const [days, setDays] = useState(30);
  const [issued, setIssued] = useState([]);
  const [history, setHistory] = useState([]);

  const refresh = async () => {
    const data = await getLicenseStatus();
    setStatus(data);
    if (data.isDeveloper) {
      const h = await licenseRequest('history');
      setHistory(h.keys || []);
    }
    return data;
  };

  useEffect(() => {
    let active = true;
    getLicenseStatus().then(async (data) => {
      if (!active) return;
      setStatus(data);
      if (data.isDeveloper) {
        const h = await licenseRequest('history');
        if (active) setHistory(h.keys || []);
      }
    }).catch((err) => {
      if (active && err.status === 401) navigate('/login', { replace: true });
      else if (active) setError(err.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [navigate]);

  const redeem = async (event) => {
    event.preventDefault();
    if (!key.trim() || busy) return;
    setBusy('redeem'); setError(''); setNotice('');
    try {
      const res = await redeemLicenseKey(key);
      setKey('');
      setNotice('Ключ активирован! Доступ ' + (res.expiresAt ? 'до ' + formatDate(res.expiresAt) : 'навсегда') + '.');
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const generate = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy('generate'); setError(''); setNotice('');
    try {
      const result = await licenseRequest('generate', { count, durationDays: days });
      setIssued(result.keys || []);
      setNotice('Ключи созданы. Скопируйте их сейчас: позже полные значения не показываются.');
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const download = async () => {
    if (busy) return;
    setBusy('download'); setError('');
    try {
      await downloadLicensedClient();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const copyKeys = async () => {
    try {
      await navigator.clipboard.writeText(issued.join('\n'));
      setNotice('Ключи скопированы.');
    } catch {
      setNotice('Выделите и скопируйте ключи из поля ниже.');
    }
  };

  return (
    <motion.section className="keys-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <div className="container keys-container">
        <Link to="/profile" className="keys-back"><ArrowLeft size={16} /> Личный кабинет</Link>
        <div className="keys-heading">
          <div className="keys-heading-icon"><KeyRound size={24} /></div>
          <h1>Ключи Syrex Client</h1>
          <p>Активируйте ключ на своём аккаунте, чтобы получить доступ к скачиванию клиента.</p>
        </div>

        {loading && <div className="keys-panel keys-muted">Проверяем аккаунт и лицензию…</div>}
        {error && <div className="keys-error" role="alert">{error}</div>}
        {notice && <div className="keys-notice" role="status">{notice}</div>}

        {status && <div className="keys-panel keys-status">
          <div>
            <span className="keys-panel-label"><ShieldCheck size={16} /> Статус доступа</span>
            <h2>{status.active ? 'Доступ открыт' : 'Ключ не активирован'}</h2>
            <p>{status.isDeveloper ? 'Аккаунт DEV: доступ разработчика.' :
              status.active ? 'Лицензия до ' + formatDate(status.expiresAt) :
              'Введите ключ, чтобы открыть скачивание.'}</p>
          </div>
          {status.active &&
            <button className="keys-primary" type="button" disabled={busy !== '' || !status.fileReady} onClick={download}>
              <Download size={17} /> {status.fileReady ? (busy === 'download' ? 'Получаем файл…' : 'Скачать клиент') : 'Клиент ещё не загружен'}
            </button>}
        </div>}

        {status && !status.active && <form className="keys-panel keys-redeem" onSubmit={redeem}>
          <span className="keys-panel-label"><KeyRound size={16} /> Активация</span>
          <h2>Введите ключ</h2>
          <p>Ключ одноразовый. После активации доступ привязывается к вашему аккаунту.</p>
          <div className="keys-form-line">
            <input value={key} onChange={(e) => setKey(e.target.value.toUpperCase().slice(0, 38))} required autoComplete="off" spellCheck="false" placeholder="SYREX-XXXXX-XXXXX-XXXXX-XXXXX" aria-label="Ключ активации" />
            <button className="keys-primary" type="submit" disabled={busy !== '' || !key.trim()}>{busy === 'redeem' ? 'Проверяем…' : 'Активировать'}</button>
          </div>
        </form>}

        {status && status.isDeveloper && <div className="keys-panel keys-developer">
          <span className="keys-panel-label"><Settings2 size={16} /> Управление DEV</span>
          <h2>Создать ключи активации</h2>
          <p>Только аккаунт с серверной ролью DEV может выпускать новые ключи.</p>
          <form onSubmit={generate} className="keys-dev-form">
            <label>Количество
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[1,2,3,5,10].map((n) => <option value={n} key={n}>{n} шт.</option>)}
              </select>
            </label>
            <label>Срок доступа
              <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                <option value={7}>7 дней</option>
                <option value={30}>30 дней</option>
                <option value={90}>90 дней</option>
                <option value={365}>1 год</option>
                <option value={0}>Навсегда</option>
              </select>
            </label>
            <button className="keys-primary" type="submit" disabled={busy !== ''}>
              <KeyRound size={16} /> {busy === 'generate' ? 'Создаём…' : 'Создать ключи'}
            </button>
          </form>

          {issued.length > 0 && <div className="keys-issued">
            <div className="keys-issued-header">
              <strong><CheckCheck size={17} /> Новые ключи — сохраните сейчас</strong>
              <button type="button" className="keys-copy" onClick={copyKeys}><Copy size={16} /> Копировать все</button>
            </div>
            <textarea value={issued.join('\n')} rows={Math.min(issued.length + 1, 8)} readOnly aria-label="Созданные ключи" onFocus={(e) => e.target.select()} />
          </div>}

          <div className="keys-history-heading"><h3>Последние ключи</h3><button type="button" onClick={() => void refresh()} aria-label="Обновить историю"><RefreshCw size={16} /></button></div>
          {history.length ? <div className="keys-history">
            {history.map((item, i) => <div className="keys-history-row" key={item.created_at + i}>
              <div><strong>{item.key_preview}</strong><small>{item.duration_days === 0 ? 'Навсегда' : item.duration_days + ' дней'} · {formatDate(item.created_at)}</small></div>
              <span className={item.redeemed_at ? 'used' : 'unused'}>{item.redeemed_at ? 'Использован' : 'Свободен'}</span>
            </div>)}
          </div> : <p className="keys-muted">Пока нет выпущенных ключей.</p>}
        </div>}
        {status && !status.fileReady && <p className="keys-footnote">Система ключей уже работает. Для скачивания администратору нужно загрузить файл SyrexClient.jar в закрытое хранилище Supabase.</p>}
      </div>
    </motion.section>
  );
};

export default Keys;
