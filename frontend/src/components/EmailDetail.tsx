import { ExternalLink, Mail } from 'lucide-react';
import type { EmailJob } from '../types';
import { formatWhen } from '../lib/time';

export function EmailDetail({ email }: { email: EmailJob | null }) {
  if (!email) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 space-y-2">
        <Mail className="h-10 w-10 text-gray-300" />
        <p className="text-xs">Select an email entry to inspect detailed content and Ethereal preview.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-base font-bold text-gray-900">{email.subject}</h2>
        <p className="text-xs font-mono text-gray-400 mt-1">{email.id}</p>
      </div>
      <div className="flex items-start justify-between text-xs">
        <div className="flex items-center space-x-3">
          <span className="h-9 w-9 rounded-full bg-[#00b050] text-white font-bold flex items-center justify-center text-sm">
            {email.toEmail.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <span className="block font-bold text-gray-900">{email.toEmail}</span>
            <span className="block text-[11px] text-gray-400">from {email.sender.fromEmail}</span>
          </span>
        </div>
        <span className="text-gray-400 text-[11px] text-right">
          <span className="block text-[#00b050] font-semibold">{email.status.toUpperCase()}</span>
          <span className="block">Scheduled {formatWhen(email.scheduledAt)}</span>
          {email.sentAt && <span className="block">Sent {formatWhen(email.sentAt)}</span>}
        </span>
      </div>
      {email.status === 'rescheduled' && (
        <div className="bg-[#fffbeb] border border-[#fef3c7] p-3.5 rounded-xl text-amber-900 font-medium text-xs">
          The hourly limit was already full, so this message was moved forward. It was not dropped.
        </div>
      )}
      {email.lastError && email.status === 'failed' && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-xs">{email.lastError}</div>
      )}
      <div className="bg-[#fafafa] p-4 rounded-xl border border-gray-100 text-gray-700 whitespace-pre-wrap font-sans text-xs leading-relaxed">
        {email.body}
      </div>
      {email.previewUrl && (
        <div className="bg-[#e6f4ea] border border-[#d2ead6] p-3 rounded-xl flex items-center justify-between text-xs">
          <span className="text-[#00b050] font-semibold">Ethereal SMTP Mail Delivered</span>
          <a href={email.previewUrl} target="_blank" rel="noreferrer" className="text-[#00b050] font-bold hover:underline flex items-center">
            View Inbox
            <ExternalLink className="h-3.5 w-3.5 ml-1" />
          </a>
        </div>
      )}
    </div>
  );
}
