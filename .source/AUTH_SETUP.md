# Syrex Client — подключение авторизации

Формы регистрации, входа, восстановления пароля и профиль используют Supabase Auth.
Пока сервис не настроен, кнопки отправки логина и регистрации неактивны. Это сделано намеренно: GitHub Pages не умеет самостоятельно хранить аккаунты или проверять пароли.

## Подключение

1. Создайте проект в Supabase (https://supabase.com/). В Authentication -> Providers -> Email включите Email.
2. В Authentication -> URL Configuration установите Site URL:
   https://hhhfff0056-crypto.github.io/syrex-client/
3. Добавьте разрешённый Redirect URL:
   https://hhhfff0056-crypto.github.io/syrex-client/login
4. В настройках проекта Supabase возьмите Project URL и **publishable key** (начинается с sb_publishable_). Никогда не используйте secret key, service_role или пароль базы данных в браузере.
5. Откройте этот репозиторий: Settings -> Secrets and variables -> Actions -> Variables -> New repository variable. Создайте:
   - VITE_SUPABASE_URL = https://<ваш-проект>.supabase.co
   - VITE_SUPABASE_PUBLISHABLE_KEY = sb_publishable_...
6. Запустите заново workflow **Build provided Syrex site**, чтобы пересобрать сайт с новым конфигом. Параметры Vite VITE_ по определению видимы браузеру — так и должно быть для publishable key.
7. В Supabase оставьте включённым Confirm email. Новые пользователи подтвердят адрес по письму перед входом.
8. Проверьте регистрацию, письмо подтверждения, вход, восстановление пароля, выход и повторный вход в отдельном браузере.

## Ограничения

- Это **реальная серверная авторизация** после настройки Supabase. Пароли проверяет Supabase; сайт их не записывает.
- Сеанс браузера хранит access/refresh tokens в localStorage (при "Запомнить меня") или sessionStorage. Запрещайте опасные сторонние скрипты и внедрение пользовательского HTML.
- Ветка и история этого GitHub-репозитория публичны, поэтому исходники сайта по-прежнему открыты. Обфускация не является шифрованием.
- Админ-панель, платные подписки, активация ключей, тикеты и скачивание клиента **не подключены** к Supabase. Настраивать права нужно на сервере и в Row Level Security; нельзя доверять флагу в localStorage.
- Картинка аватара хранится локально в браузере, пока не подключено защищённое хранилище.
- Никнейм хранится в user_metadata; уникальность по никнейму и поиск по нику не реализованы. Вход работает по email.

## CAPTCHA: Google reCAPTCHA v2

Syrex использует Google reCAPTCHA v2 (чекбокс «Я не робот») для форм входа,
регистрации и восстановления пароля. Google-токены проверяет серверная Supabase
Edge Function `verify-recaptcha`. Пока нет реального site key, компонент не
отображается и существующая авторизация остаётся без CAPTCHA-защиты.

### Настройка

1. Зарегистрируйте виджет **Google reCAPTCHA v2 — Checkbox** в
   [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin/create).
   Разрешённый домен: `hhhfff0056-crypto.github.io`, без `https://` и
   без `/syrex-client/`.
2. Публичный **Site Key** добавьте в GitHub: Settings → Secrets and variables →
   Actions → Variables → `VITE_RECAPTCHA_SITE_KEY`. В этой переменной только публичный ключ.
3. Секретный **Secret Key** внесите **только** в Supabase Dashboard:
   Edge Functions → Secrets → создать `RECAPTCHA_SECRET_KEY`. Никогда не
   добавляйте секретный ключ в GitHub, исходники сайта или переписку.
4. Запустите публикацию заново, изменив файл в `.source/` или в workflow.
   После сборки на страницах входа и регистрации появится капча.
5. Проверьте вход, регистрацию и сброс пароля в реальном браузере. Неверный
   или просроченный токен должен отклоняться сервером.
6. Убедитесь, что в Supabase Auth → Bot and Abuse Protection не включена
   нативная CAPTCHA-проверка другого провайдера: Google reCAPTCHA она не
   поддерживает и запросы могут отвергаться.

### Важное ограничение

**Google reCAPTCHA не является нативным провайдером CAPTCHA в Supabase Auth.**
Функция `verify-recaptcha` проверяет токен у Google на сервере перед вызовом
входа / регистрации из интерфейса Syrex, но **прямые обращения к публичному
Supabase Auth API остаются возможны без этой проверки**. Если нужна защита
самих конечных Auth-эндпоинтов от автоматических запросов, используйте
поддерживаемые Supabase hCaptcha или Cloudflare Turnstile. Одной галочки в
браузере недостаточно.
