import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Languages } from 'lucide-react';
import { useI18n } from '../i18n/index.jsx';

export default function LanguageSwitcher() {
  const { lang, languages, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = languages.find((l) => l.code === lang) || languages[0];

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKeyDown = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const pick = (code) => {
    setLang(code);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn gap-1.5 px-2"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('a11y.languageSwitcher')}
        title={t('a11y.currentLanguage', { language: active.native })}
      >
        <Languages size={15} />
        <span className="hidden text-sm font-semibold sm:inline">{active.short}</span>
        <ChevronDown size={13} className={`text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ul className="glass fade-in-up absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl p-1" role="listbox" aria-label={t('a11y.languageSwitcher')}>
          {languages.map((language) => {
            const selected = language.code === lang;
            return (
              <li key={language.code} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => pick(language.code)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${selected ? 'bg-accent/15 text-accent' : 'text-ink hover:bg-raised'}`}
                >
                  <span aria-hidden="true" className="text-base leading-none">{language.flag}</span>
                  <span className="flex-1">
                    <span className="block font-medium">{language.native}</span>
                    <span className="block text-xs text-muted">{language.label} · {language.short}</span>
                  </span>
                  {selected && <Check size={14} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
