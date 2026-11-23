export type WhatsNewEntry = {
  version: string;
  title: string;
  items: string[];
};

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: '0.0.9-alpha',
    title: 'Nexo теперь Hearth',
    items: [
      'Новое название и новый значок.',
      'Приложение стало аккуратнее внутри: это ускорит появление новых возможностей.',
      'Ваши аккаунт, диалоги и настройки перенесены автоматически.',
      'Нужно один раз войти заново.',
      'Старую папку данных (%APPDATA%\\Nexo) можно удалить, когда убедитесь, что всё на месте.'
    ]
  }
];
