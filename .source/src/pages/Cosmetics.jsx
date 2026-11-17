import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCcw, Save, Sparkles, ShieldCheck } from 'lucide-react';
import { cosmeticsRequest } from '../services/cosmeticsApi';
import { cosmeticSections } from '../data/syrexCosmetics';
import './Cosmetics.css';

export default function Cosmetics() {
  const navigate = useNavigate();
  const [equipped, setEquipped] = useState({});
  const [linked, setLinked] = useState(false);
  const [playerUuid, setPlayerUuid] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const state = await cosmeticsRequest('mine');
      setEquipped(state.equipped || {});
      setLinked(Boolean(state.linked));
      setPlayerUuid(state.playerUuid || '');
      setNotice('');
    } catch (err) {
      setError(err.message || 'Не удалось загрузить косметику.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const save = async () => {
    if (saving || loading) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const state = await cosmeticsRequest('save', { equipped });
      setEquipped(state.equipped || {});
      setNotice('Косметика сохранена. Игроки Syrex увидят изменения после обновления данных.');
    } catch (err) {
      setError(err.message || 'Не удалось сохранить выбор.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="syrex-cosmetics">
      <div className="syrex-cosmetics-wrap">
        <button type="button" className="syrex-cosmetics-back" onClick={() => navigate('/profile')}>
          <ArrowLeft size={17} /> Профиль
        </button>
        <header className="syrex-cosmetics-head">
          <div className="syrex-cosmetics-icon"><Sparkles size={29}/></div>
          <div>
            <h1>Моя косметика</h1>
            <p>Синхронизируется между сайтом и Minecraft-клиентом Syrex</p>
          </div>
        </header>
        <div className="syrex-cosmetics-note">
          <ShieldCheck size={19}/>
          <span>{linked ? 'Minecraft UUID привязан. Выбранная косметика видна другим игрокам Syrex.' :
            'Minecraft ещё не привязан. Войдите с действующей онлайн-сессией Minecraft Java и зайдите на сервер с Syrex для подтверждения UUID.'}
            {playerUuid && <small>UUID: {playerUuid}</small>}
          </span>
        </div>
        {loading ? <p className="syrex-cosmetics-status">Загружаем косметику…</p> : (
          <>
            <div className="syrex-cosmetics-grid">
              {cosmeticSections.map(section => (
                <label className="syrex-cosmetics-tile" key={section.key}>
                  <span className="syrex-cosmetics-label">{section.title}</span>
                  <select
                    value={equipped[section.key] == null ? '' : String(equipped[section.key])}
                    onChange={event => {
                      const value = event.target.value;
                      setEquipped(old => {
                        const next = { ...old };
                        if (!value) delete next[section.key];
                        else next[section.key] = Number(value);
                        return next;
                      });
                      setNotice('');
                    }}
                  >
                    <option value="">Без косметики</option>
                    {section.options.map(option => (
                      <option value={option.id} key={option.id}>{option.name} · ID {option.id}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="syrex-cosmetics-actions">
              <button type="button" className="syrex-cosmetics-primary" onClick={save} disabled={saving}>
                <Save size={17}/>{saving ? 'Сохраняем…' : 'Сохранить косметику'}
              </button>
              <button type="button" className="syrex-cosmetics-secondary" onClick={reload} disabled={saving}>
                <RefreshCcw size={16}/> Обновить с сервера
              </button>
            </div>
          </>
        )}
        {error && <p className="syrex-cosmetics-error" role="alert">{error}</p>}
        {notice && <p className="syrex-cosmetics-success" role="status">{notice}</p>}
        <p className="syrex-cosmetics-foot">Косметику видят игроки с Syrex на совместимых серверах. Для первичной привязки UUID используется проверка сессии Minecraft, без передачи Minecraft-токена на сайт. На офлайн-аккаунтах подтверждение UUID недоступно.</p>
      </div>
    </main>
  );
}
