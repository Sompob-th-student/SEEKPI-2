import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import original from './seekpi-original.json'
import { extra } from './extra'

export type Lang = 'en' | 'th'
const dict: Record<Lang, Record<string, string>> = {
  en: { ...(original.en as Record<string, string>), ...extra.en },
  th: { ...(original.th as Record<string, string>), ...extra.th },
}

const humanize = (k: string) => k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string }
const I18nCtx = createContext<Ctx>(null as unknown as Ctx)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('language') === 'th' ? 'th' : 'en'))
  const setLang = useCallback((l: Lang) => { localStorage.setItem('language', l); setLangState(l) }, [])
  const t = useCallback((key: string) => dict[lang][key] ?? dict.en[key] ?? humanize(key), [lang])
  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>
}
export const useI18n = () => useContext(I18nCtx)
