const ru = {
  appTitle: "Планировщик распределения ресурсов",
  webEdition: "Web версия",
  desktopEdition: "Desktop версия",
  downloadDesktop: "Скачать Desktop",
  continue: "Продолжить",
  login: "Войти",
  logout: "Выйти",
  registerDisabled: "Регистрация отключена",
  email: "Email",
  password: "Пароль",
  home: "Главная",
  create: "Создать",
  templates: "Шаблоны",
  publicTemplates: "Публичные шаблоны",
  favorites: "Избранное",
  recent: "Недавние",
  trash: "Корзина",
  org: "Организация",
  notifications: "Уведомления",
  admin: "Админ",
  compare: "Сравнение",
  solve: "Рассчитать",
  whatIf: "Анализ чувствительности",
  venueCloud: "Облако",
  venueLocal: "Локально",
  venueLabel: "Где считать",
  generationPurge: "Предыдущие прогоны будут удалены {date}",
  generationActiveHint:
    "При следующем пересчёте текущий прогон уйдёт в архив (удаление через 30 дней)",
  attachOrg: "В организацию",
  makePublicInOrg: "Сделать публичным внутри организации",
  guestUpload: "Локальный сценарий будет загружен в облако",
  share: "Поделиться",
  fork: "Форкнуть",
  favorite: "В избранное",
  unfavorite: "Убрать из избранного",
  hideInOrg: "Скрыть в org",
  showInOrg: "Показать в org",
  personal: "Личные",
  orgPrivate: "Мои org-private",
  orgFeed: "Лента org",
  hardDelete: "Удалить навсегда",
  tryAsGuest: "Попробовать как гость (Task 13)",
} as const;

export type RuKey = keyof typeof ru;

export function t(key: RuKey, vars?: Record<string, string>): string {
  let s: string = ru[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(`{${k}}`, v);
    }
  }
  return s;
}

export { ru };
