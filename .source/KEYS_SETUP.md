# Syrex Client — цены Premium и ключи

Актуальные тарифы: Premium 30 дней — 199 ₽; 90 дней — 299 ₽; 180 дней — 499 ₽; навсегда — 899 ₽.
Отдельная разовая услуга сброса HWID — 99 ₽ (это не лицензия Premium).

Страница тарифов: /products. Страница покупки: /buy?plan=PREMIUM_30, /buy?plan=PREMIUM_90,
 /buy?plan=PREMIUM_180, /buy?plan=PREMIUM_FOREVER, /buy?plan=HWID_RESET.

Оплата и получение ключа согласовываются с продавцом на FunPay. Платёжная система и
 автоматическая выдача после оплаты в Syrex не подключены. Не выдавайте ключи по
 неподтверждённым заявлениям об оплате.

DEV (роль Supabase app_metadata.role=DEV) может выпускать только Premium ключи
 на 30, 90, 180 дней и навсегда на странице /keys. Ключи одноразовые и привязываются
 к аккаунту, а не к браузеру. Система возвращает до 10 новых ключей разово,
 полные значения в базе не хранятся (только SHA-256). Срок 0 означает бессрочно.

Для скачивания необходим файл SyrexClient.jar в частном бакете syrex-client Supabase Storage.
Без файла кнопка неактивна. Срок временной ссылки для скачивания — 60 секунд.

Старая /admin относится к прежней локальной реализации и пока не подключена к
 серверному механизму ключей. Не используйте её для выдачи рабочих ключей.

## Бесплатная версия Free

Если у пользователя нет активной лицензии Premium, в профиле и на /keys показывается статус Free и возможность скачать бесплатную редакцию без ключа. После активации Premium пользователь видит скачивание полной редакции. При истечении подписки автоматически возвращается Free. Для скачивания обеих редакций нужен вход в аккаунт.

Бесплатный файл загружать в закрытый бакет syrex-client с точным именем **SyrexFree.jar**, а Premium — с именем **SyrexClient.jar**. Файлы должны быть разными сборками: сервер не переименовывает Premium в Free и не ограничивает функции самой игры. Если Free-файл не загружен, кнопка будет честно показывать «Free ещё не загружен» и не выдаст выдуманную ссылку. Доступность обеих редакций проверяется на сервере. Ссылки временные (60 секунд), бакет остаётся приватным.

## Текущая сборка Free из Google Drive

17 ноября 2026 загружен файл `syrex_1.21.11.jar` (50 995 067 байт) в Dropbox
по пути `/syrex_1.21.11.jar`. Пока у него нет публичной Dropbox-ссылки,
кнопка Free получает адрес Google Drive для того же исходного файла:
`https://drive.google.com/uc?export=download&id=19RjjDRApK5v09zwbZv_39SvEtKO0k0-Y`.
Это публичная версия: ключ Premium для неё не требуется, но нужен вход на сайт.
Когда пользователь получит публичную ссылку Dropbox, необходимо заменить
`freeFallbackUrl` на подтверждённый Dropbox URL с параметром `dl=1`.
Полный Premium по-прежнему закрыт серверной проверкой лицензии.


## Подключенная кнопка Free — 17 ноября 2026

Кнопка «Скачать Free» выдаёт прямую Dropbox-ссылку на **syrex_1.21.11.jar**
(50 995 067 байт), загруженный из указанного владельцем файла Google Drive
в Dropbox по адресу `/syrex_1.21.11.jar`.

Рабочая публичная ссылка с `dl=1`:
https://www.dropbox.com/scl/fi/p637g4pv1qmgnk813ex6h/syrex_1.21.11.jar?rlkey=vbnt9irw8o2kcywr788k60th9&dl=1

Публичный доступ: anyone with the link; разрешено скачивание.
Ключ Premium для Free не требуется, но для кнопки нужен вход на сайт.
Полная Premium-сборка по-прежнему защищена лицензией и закрытым бакетом Supabase.

## Числовой UID пользователей

`public.syrex_user_uids`: `user_id uuid` (internal PK, references auth.users.id),
`uid bigint generated always as identity` (unique, shown to the user),
`created_at`. Existing accounts were backfilled in creation order. A protected
`AFTER INSERT` trigger on `auth.users` gives each new user the next number.

The `syrex-keys` Edge Function `status` reads the number with the server-only
service-role client and returns `uid: number`; the website displays it at
`/profile` and `/keys`. There are no browser read/write permissions on the
mapping table. Never use numeric UID instead of the internal Auth UUID for
ownership checks, permissions, license linkage, or authentication.

Database migration deployed: `syrex_sequential_user_uids`.
