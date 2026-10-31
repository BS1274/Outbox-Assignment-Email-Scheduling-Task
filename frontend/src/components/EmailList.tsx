import { Star } from 'lucide-react';
import type { EmailJob } from '../types';
import { formatWhen } from '../lib/time';

const STATUS_CLASS: Record<EmailJob['status'], string> = {
  scheduled: 'bg-gray-100 text-gray-600',
  sending: 'bg-amber-50 text-amber-700',
  rescheduled: 'bg-orange-50 text-orange-700',
  sent: 'bg-[#e6f4ea] text-[#00b050]',
  failed: 'bg-rose-50 text-rose-600',
};

export function EmailList(props: {
  emails: EmailJob[];
  loading: boolean;
  emptyLabel: string;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (props.loading) {
    return <div className="p-12 text-center text-gray-400 text-xs">Loading emails…</div>;
  }
  if (props.emails.length === 0) {
    return <div className="p-12 text-center text-gray-400 text-xs">{props.emptyLabel}</div>;
  }
  return (
    <>
      {props.emails.map((email) => {
        const selected = email.id === props.selectedId;
        return (
          <button
            key={email.id}
            onClick={() => props.onSelect(email.id)}
            className={`w-full p-4 flex items-start justify-between cursor-pointer transition text-left ${
              selected ? 'bg-[#f4fbf6]' : 'hover:bg-gray-50'
            }`}
          >
            <span className="flex items-start space-x-3 min-w-0 pr-3">
              <span className="h-8 w-8 rounded-full bg-emerald-100 text-[#00b050] font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                {email.toEmail.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 space-y-1">
                <span className="block text-xs font-semibold text-gray-900 truncate">{email.toEmail}</span>
                <span className="flex items-center space-x-2 flex-wrap">
                  <span className={`inline-flex items-center text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${STATUS_CLASS[email.status]}`}>
                    {email.status.toUpperCase()}
                  </span>
                  <span className="text-[11px] text-gray-400 truncate">{email.subject}</span>
                </span>
              </span>
            </span>
            <span className="flex flex-col items-end space-y-2 shrink-0">
              <span className="text-[11px] text-gray-400">{formatWhen(email.sentAt || email.scheduledAt)}</span>
              <Star className="h-4 w-4 text-gray-300" />
            </span>
          </button>
        );
      })}
    </>
  );
}
