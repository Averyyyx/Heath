// Словарь строк интерфейса. Русский — язык по умолчанию, английский добавлен для будущего переключателя.
export type Lang = 'ru' | 'en';

export function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'ru';
  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'ru';
}

const ru = {
  appName: 'Hearth',
  loadingSession: 'Загружаем сессию…',
  logout: 'Выйти',
  windowMinimize: 'Свернуть',
  windowMaximize: 'Развернуть',
  windowClose: 'Закрыть',
  loginTitle: 'Войдите, чтобы продолжить',
  registerTitle: 'Создайте аккаунт Hearth',
  loginSubtitle: 'Сообщества, звонки и репозитории — всё в одном месте.',
  registerSubtitle: 'Сначала зарегистрируйтесь, затем выберите отображаемое имя и ник.',
  email: 'Email',
  password: 'Пароль',
  rememberDevice: 'Запомнить устройство',
  forgotPassword: 'Забыли пароль?',
  login: 'Войти',
  register: 'Создать аккаунт',
  noAccount: 'Нет аккаунта?',
  hasAccount: 'Уже с нами?',
  create: 'Создать',
  signIn: 'Войти',
  orDivider: 'или',
  continueWithGithub: 'Войти через GitHub',
  settingsSaved: 'Сохранено',
  themeLight: 'Светлая',
  themeDark: 'Тёмная',
  themeSystem: 'Как в системе'
} as const;

export type StringKey = keyof typeof ru;

const en: Record<StringKey, string> = {
  appName: 'Hearth',
  loadingSession: 'Loading session…',
  logout: 'Log out',
  windowMinimize: 'Minimize',
  windowMaximize: 'Maximize',
  windowClose: 'Close',
  loginTitle: 'Log in to continue',
  registerTitle: 'Create your Hearth account',
  loginSubtitle: 'Communities, calls and repositories — all in one place.',
  registerSubtitle: 'Register first, then pick a display name and handle.',
  email: 'Email',
  password: 'Password',
  rememberDevice: 'Remember this device',
  forgotPassword: 'Forgot password?',
  login: 'Log in',
  register: 'Create account',
  noAccount: 'No account yet?',
  hasAccount: 'Already with us?',
  create: 'Create',
  signIn: 'Log in',
  orDivider: 'or',
  continueWithGithub: 'Continue with GitHub',
  settingsSaved: 'Saved',
  themeLight: 'Light',
  themeDark: 'Dark',
  themeSystem: 'System'
};

const dictionaries: Record<Lang, Record<StringKey, string>> = { ru, en };

export function t(key: StringKey, lang: Lang = detectLang()): string {
  return dictionaries[lang][key] ?? ru[key];
}
