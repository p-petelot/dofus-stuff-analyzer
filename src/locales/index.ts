import { createI18n } from 'vue-i18n'
import fr from './fr'
import en from './en'

export type MessageSchema = typeof fr

export const i18n = createI18n<[MessageSchema], 'fr' | 'en'>({
  legacy: false,
  locale: 'fr',
  fallbackLocale: 'fr',
  messages: {
    fr,
    en
  }
})

export function setLocale(locale: string) {
  // @ts-ignore
  i18n.global.locale.value = locale
}

export function getLocale(): string {
  // @ts-ignore
  return i18n.global.locale.value
}
