import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useI18n } from '../i18n/index.jsx';

export default function ExportMenu({ onCsv, onPdf, disabled }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => ref.current && !ref.current.contains(event.target) && setOpen(false);
    const onKeyDown = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (fn) => () => {
    setOpen(false);
    fn();
  };

  const options = [
    { id: 'csv', icon: FileSpreadsheet, label: t('export.csv'), run: onCsv },
    { id: 'pdf', icon: FileText, label: t('export.pdf'), run: onPdf }
  ];

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn gap-1.5" onClick={() => setOpen((v) => !v)} disabled={disabled} aria-haspopup="menu" aria-expanded={open}>
        <Download size={14} />
        <span className="hidden sm:inline">{t('export.button')}</span>
        <ChevronDown size={13} className={`text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="glass fade-in-up absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl p-1" role="menu">
          {options.map((option) => (
            <button key={option.id} type="button" role="menuitem" className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-raised" onClick={choose(option.run)}>
              <option.icon size={15} className="mt-0.5 shrink-0 text-accent" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
