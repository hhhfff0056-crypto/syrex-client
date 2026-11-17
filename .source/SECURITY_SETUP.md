# Syrex Client — защита от ботов и перегрузки

## Что включено сейчас

- GitHub Pages раздаёт статические файлы; исходные ключи Supabase Secret/Service Role не попадают в фронтенд.
- Все действующие Syrex Edge Functions (syrex-keys, syrex-device, syrex-cosmetics, syrex-captcha) имеют серверный rate limiting через атомарную PostgreSQL RPC `public.syrex_rate_limit_check`.
- Лимиты per-IP — предварительная защита до дорогой проверки JWT; лимиты per-user работают после проверки Supabase Auth и предотвращают обход с разных IP одним аккаунтом.
- IP-адреса / e-mail / токены не сохраняются в таблице: записываются только SHA-256 отпечатки с серверным секретом. У таблицы включён RLS, у обычных пользователей нет SELECT и EXECUTE на RPC.
- Возвращается HTTP 429 вместо выполнения тяжёлых операций, если квота превышена. При отказе БД выдаётся ошибка — лимиты не обходятся автоматически.
- Ключи и скачивание Premium по-прежнему контролируются сервером; косметика и проверка устройства требуют аутентификации, а скачивание Free остаётся доступным.
- В `syrex-captcha` есть лимиты на выдачу и проверку арифметических заданий. Сами арифметические задания **не защищают напрямую Supabase Auth**, потому что браузер вызывает `/auth/v1` независимо от этого endpoint.

## Лимиты серверных API (на пользователя, если не указано иное)

| Сервис | Операции | Лимит |
|--|--|--|
| keys | status | 120/мин |
| keys | download / download-free (общий счётчик) | до 15–30/мин |
| keys | redeem | 8/10 мин (+ уже действующие ограничения RPC по активациям) |
| keys | generate | 10/10 мин |
| keys | history | 45/мин |
| device | status | 90/мин |
| device | bind | 6/10 мин |
| device | verify | 180/мин |
| cosmetics | lookup | 180/мин |
| cosmetics | mine | 60/мин |
| cosmetics | challenge | 6/10 мин |
| cosmetics | link | 12/10 мин |
| cosmetics | save | 45/мин |
| captcha | challenge | 30/5 мин на сетевой адрес |
| captcha | verify | 60/5 мин на сетевой адрес |

Также имеются предварительные лимиты по сетевому адресу: keys 240/мин, device 240/мин, cosmetics 360/мин. Заголовки IP могут быть неточными из-за NAT, прокси и возможного spoofing; эта защита — вспомогательная, не замена WAF. Корректность лимитов нужно наблюдать под реальной нагрузкой, чтобы не отрезать многопользовательские сети.

## Для настоящей CAPTCHA на входе, регистрации и восстановлении

Браузерный код готов поддерживать **Cloudflare Turnstile**, но её серверная проверка не включается без двух внешних ключей. Настройка:

1. Создать Turnstile widget в Cloudflare и разрешить hostname `hhhfff0056-crypto.github.io`. Сохранить **Site Key** и **Secret Key**.
2. В репозитории GitHub `hhhfff0056-crypto/syrex-client` открыть Settings → Secrets and variables → Actions → Variables и добавить публичную переменную `VITE_TURNSTILE_SITE_KEY` = Site Key. Запустить Build provided Syrex site и проверить появление Turnstile. **Секрет сюда никогда не помещать.**
3. В Supabase Dashboard проекта `schhzjmsgdjicoiadoqx` открыть Authentication → Security and Protection (или Attack Protection/Bot and Abuse Protection) и включить CAPTCHA provider **Cloudflare Turnstile** с **Secret Key**. Сделать это после публикации фронтенда с Site Key, чтобы не заблокировать вход до готовности формы.
4. Проверить регистрацию, вход, восстановление пароля и прямой запрос к `/auth/v1/signup` без валидного Turnstile token: последний должен быть отклонён на стороне Supabase Auth.

Пока указанные ключи не предоставлены и провайдер не настроен, остаётся старая арифметическая проверка с лимитами, **не** гарантирующая блокировку ботов в Supabase Auth.

## DDoS и CDN/WAF

У текущего сайта домен `hhhfff0056-crypto.github.io`. Поскольку это домен GitHub, пользователь не может управлять его DNS/WAF в своём Cloudflare аккаунте. GitHub Pages обслуживает статику на своей инфраструктуре — серверного middleware для полного IP-фильтра на GitHub Pages нет.

Для WAF требуется собственный домен: привязать его к GitHub Pages, направить DNS через Cloudflare proxy, включить managed WAF rules, bot protection и разумные rate limiting rules. **Сервис Supabase имеет другой публичный URL** `schhzjmsgdjicoiadoqx.supabase.co`; WAF перед GitHub Pages не фильтрует прямые запросы к Supabase. Для Auth необходима нативная CAPTCHA Supabase и провайдерские лимиты. Обещать полную защиту от DDoS без CDN/провайдера нельзя.

## Эксплуатация

- Метрики/логи: Supabase Dashboard → Logs → Edge Functions. Отслеживать рост HTTP 429/401/403/500, особенно из-за NAT и возможных ложных блокировок.
- Таблица счётчиков `public.syrex_api_rate_limits` хранит только отпечатки. Удалять старые (старше 2 часов) в рамках регламентного обслуживания, например по расписанию Supabase Cron, если он настроен.
- При изменении списка операций обновлять allowlist RPC `syrex_rate_limit_check`, иначе новые действия будут блокироваться.
- Не полагаться на обфускацию JS, CORS или арифметическую капчу как на полноценную защиту API.
