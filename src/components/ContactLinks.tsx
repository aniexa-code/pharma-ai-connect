import { Icon } from "./brand";

export function ContactLinks({ phone, whatsapp, lat, lng }: { phone: string; whatsapp?: string | null; lat?: number; lng?: number }) {
  const cls = "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-navy transition hover:border-blue hover:text-blue";
  return (
    <span className="flex flex-wrap gap-2">
      <a href={`tel:${phone}`} className={cls}><Icon name="phone" size={15} />Appeler</a>
      {whatsapp && <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className={cls}><Icon name="chat" size={15} />WhatsApp</a>}
      {lat !== undefined && lng !== undefined && (
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`} target="_blank" rel="noopener noreferrer" className={cls}><Icon name="route" size={15} />Itinéraire</a>
      )}
    </span>
  );
}
