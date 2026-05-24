export const APP_STORAGE_KEYS = {
  theme: 'hs-hub-theme',
  zoom: 'hs-hub:zoom-level',
  viewMode: 'hs-hub-view-mode',
  tagColors: 'hs-hub:tag-color-overrides',
  statusColors: 'hs-hub:status-color-overrides',
  propertyModes: 'hs-hub:display-mode-overrides',
  configMigrationFlag: 'hs-hub:config-migrated-to-vault',
  sortPreferences: 'hs-hub-sort-preferences',
  sidebarCollapsed: 'hs-hub:sidebar-collapsed',
  layoutPanels: 'hs-hub:layout-panels',
  welcomeDismissed: 'hs-hub_welcome_dismissed',
} as const

type AppStorageKey = keyof typeof APP_STORAGE_KEYS

export function getAppStorageItem(key: AppStorageKey): string | null {
  try {
    const storageKey = Reflect.get(APP_STORAGE_KEYS, key) as string
    return localStorage.getItem(storageKey)
  } catch {
    return null
  }
}
