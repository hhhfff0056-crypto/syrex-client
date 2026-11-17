import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Backpack, Check, Crown, Feather, PawPrint,
  RefreshCcw, Save, ShieldCheck, Sparkles, X
} from 'lucide-react';
import { cosmeticsRequest } from '../services/cosmeticsApi';
import { cosmeticSections } from '../data/syrexCosmetics';
import './Cosmetics.css';

// Authentic 128x128 in-client renders from assets/syrux/cosmetics/*/<id>/preview.png.
// Sprite rows: wings, hats, pets, bodywear. The server IDs remain unchanged.
const previewIds = {
  wings: [25, 61, 62, 63, 64, 65, 82, 86, 91, 99, 123, 124, 136],
  hat: [48, 49, 50, 53, 57, 80, 88, 92, 96, 97, 98],
  pet: [45, 46, 47, 81, 84, 90, 93, 126, 132, 133, 134, 135],
  bodywear: [36, 37, 38, 39, 40, 41, 42, 43, 44, 95, 137]
};

const tabs = [
  { key: 'wings', title: 'Крылья', Icon: Feather },
  { key: 'hat', title: 'Головной убор', Icon: Crown },
  { key: 'pet', title: 'Питомец', Icon: PawPrint },
  { key: 'bodywear', title: 'Рюкзак', Icon: Backpack }
];

const gallery = Object.fromEntries(tabs.map((tab, row) => {
  const source = cosmeticSections.find(section => section.key === tab.key);
  const labels = new Map((source?.options || []).map(option => [option.id, option.name]));
  const entries = previewIds[tab.key].map((id, column) => ({
    id, column, row, name: labels.get(id) || 'Косметика #' + id
  }));
  return [tab.key, entries];
}));

const spriteUrl = import.meta.env.BASE_URL + 'cosmetics/syrex-preview-atlas.webp';

export default function Cosmetics() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('wings');
  const [equipped, setEquipped] = useState({});
  const [linked, setLinked] = useState(false);
  const [playerUuid, setPlayerUuid] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
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
      setDirty(false);
      setNotice('');
    } catch (err) {
      setError(err.message || 'Не удалось загрузить косметику.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const choose = (key, id) => {
    if (saving || loading) return;
    setEquipped(old => {
      const next = { ...old };
      if (id === null) delete next[key];
      else next[key] = id;
      return next;
    });
    setDirty(true);
    setNotice('');
  };

  const save = async () => {
    if (saving || loading || !dirty) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await cosmeticsRequest('save', { equipped });
      setEquipped(result.equipped || {});
      setDirty(false);
      setNotice('Косметика сохранена на сервере Syrex. Игроки с клиентом увидят её после синхронизации.');
    } catch (err) {
      setError(err.message || 'Не удалось сохранить выбор.');
    } finally {
      setSaving(false);
    }
  };

  const currentTab = tabs.find(tab => tab.key === activeTab) || tabs[0];
  const currentItems = gallery[activeTab] || [];
  const selectedId = equipped[activeTab];
  const selectedOption = currentItems.find(item => item.id === selectedId);

  return (
    <main className="syrex-cosmetics">
      <div className="syrex-cosmetics-wrap">
        <button type="button" className="syrex-cosmetics-back" onClick={() => navigate('/profile')}>
          <ArrowLeft size={17} /> Назад в профиль
        </button>

        <header className="syrex-cosmetics-head">
          <div className="syrex-cosmetics-icon"><Sparkles size={29}/></div>
          <div>
            <h1>Моя косметика</h1>
            <p>Выбирай внешний вид прямо на сайте — изменения сохраняются для клиента Syrex</p>
          </div>
        </header>

        <div className="syrex-cosmetics-note">
          <ShieldCheck size={20}/>
          <span>
            {linked
              ? 'Minecraft UUID подтверждён. Твои предметы могут видеть другие игроки с Syrex.'
              : 'Для отображения другим игрокам нужно привязать Minecraft UUID в клиенте с действующей онлайн-сессией.'}
            {playerUuid && <small>Minecraft UUID: {playerUuid}</small>}
          </span>
        </div>

        <nav className="syrex-cosmetics-tabs" aria-label="Категории косметики">
          {tabs.map(({ key, title, Icon }) => (
            <button
              key={key}
              type="button"
              className={'syrex-cosmetics-tab' + (activeTab === key ? ' is-current' : '')}
              onClick={() => setActiveTab(key)}
              aria-current={activeTab === key ? 'page' : undefined}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{title}</span>
              {equipped[key] != null && <span className="syrex-cosmetics-dot" aria-label="Выбрано" />}
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="syrex-cosmetics-loading" role="status">Загружаем твою косметику…</div>
        ) : (
          <>
            <div className="syrex-gallery-heading">
              <div>
                <h2>{currentTab.title}</h2>
                <p>{currentItems.length} вариантов из оригинальных файлов Syrex</p>
              </div>
              <button
                type="button"
                className="syrex-cosmetics-clear"
                onClick={() => choose(activeTab, null)}
                disabled={saving || selectedId == null}
              >
                <X size={16} /> Снять
              </button>
            </div>

            <div className="syrex-gallery-grid">
              {currentItems.map(item => {
                const selected = selectedId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={'syrex-gallery-card' + (selected ? ' is-equipped' : '')}
                    onClick={() => choose(activeTab, item.id)}
                    disabled={saving}
                    aria-pressed={selected}
                    title={'Примерить: ' + item.name}
                  >
                    <div className="syrex-gallery-media">
                      <div
                        className="syrex-gallery-preview"
                        role="img"
                        aria-label={'Внешний вид: ' + item.name}
                        style={{
                          backgroundImage: 'url("' + spriteUrl + '")',
                          backgroundPosition: (-item.column * 128) + 'px ' + (-item.row * 128) + 'px'
                        }}
                      />
                      {selected && <span className="syrex-gallery-selected"><Check size={13}/> Надето</span>}
                    </div>
                    <div className="syrex-gallery-card-footer">
                      <span className="syrex-gallery-card-name">{item.name}</span>
                      <small>ID {item.id}</small>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="syrex-gallery-selection" aria-live="polite">
              <span className="syrex-gallery-selection-label">Сейчас выбрано</span>
              <strong>{selectedOption?.name || (selectedId == null ? 'Без косметики' : 'Предмет #' + selectedId)}</strong>
              {dirty && <span className="syrex-gallery-unsaved">Есть несохранённые изменения</span>}
            </div>

            <div className="syrex-cosmetics-actions">
              <button type="button" className="syrex-cosmetics-primary" onClick={save} disabled={saving || !dirty}>
                <Save size={17}/>{saving ? 'Сохраняем…' : 'Сохранить изменения'}
              </button>
              <button type="button" className="syrex-cosmetics-secondary" onClick={reload} disabled={saving}>
                <RefreshCcw size={16}/> Обновить
              </button>
            </div>
          </>
        )}
        {error && <p className="syrex-cosmetics-error" role="alert">{error}</p>}
        {notice && <p className="syrex-cosmetics-success" role="status">{notice}</p>}
        <p className="syrex-cosmetics-foot">
          Превью взяты из ресурсов клиента Syrex. Это изображения игровых 3D-моделей, а не текстурные развёртки.
          Косметика синхронизируется через аккаунт и отображается другим игрокам только с совместимым клиентом.
        </p>
      </div>
    </main>
  );
}
