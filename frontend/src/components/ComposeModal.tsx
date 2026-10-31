import { FormEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bold, Clock3, Italic, Link2, List, ListOrdered, Paperclip, Underline, Upload, X } from 'lucide-react';
import type { Sender } from '../types';
import { extractEmails } from '../lib/emails';
import { formatWhen, toLocalInput, tomorrowAt } from '../lib/time';

type Props = {
  senders: Sender[];
  senderId: string;
  onClose: () => void;
  onSchedule: (input: {
    subject: string;
    body: string;
    leadsText: string;
    startAt: string;
    delayBetweenSeconds: number;
    hourlyLimit: number;
    senderId: string;
  }) => Promise<void>;
};

export function ComposeModal({ senders, senderId, onClose, onSchedule }: Props) {
  const [fromId, setFromId] = useState(senderId || senders[0]?.id || '');
  const [leadsText, setLeadsText] = useState('');
  const [draftRecipient, setDraftRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(200);
  const [startAt, setStartAt] = useState(() => tomorrowAt(10));
  const [showLater, setShowLater] = useState(false);
  const [laterDraft, setLaterDraft] = useState(() => toLocalInput(tomorrowAt(10)));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const recipients = useMemo(() => extractEmails(`${leadsText}\n${draftRecipient}`), [leadsText, draftRecipient]);
  const sender = senders.find((item) => item.id === fromId) || senders[0];

  function addRecipient() {
    const found = extractEmails(draftRecipient);
    if (found.length === 0) {
      setError('Enter a valid email address.');
      return;
    }
    setLeadsText((current) => `${current}\n${found.join('\n')}`);
    setDraftRecipient('');
    setError('');
  }

  function removeRecipient(email: string) {
    setLeadsText((current) =>
      extractEmails(current)
        .filter((item) => item !== email)
        .join('\n'),
    );
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const found = extractEmails(text);
    if (found.length === 0) {
      setError(`No email addresses were found in ${file.name}.`);
      return;
    }
    setLeadsText((current) => `${current}\n${text}`);
    setError('');
  }

  function wrap(before: string, after = before) {
    const node = bodyRef.current;
    if (!node) return;
    const start = node.selectionStart;
    const end = node.selectionEnd;
    const selected = body.slice(start, end) || 'text';
    const next = `${body.slice(0, start)}${before}${selected}${after}${body.slice(end)}`;
    setBody(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!subject.trim()) {
      setError('Please enter a subject line.');
      return;
    }
    if (!body.trim()) {
      setError('No body content provided.');
      return;
    }
    if (recipients.length === 0) {
      setError('Please enter at least one valid recipient email or upload a list.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSchedule({
        subject: subject.trim(),
        body: body.trim(),
        leadsText: recipients.join('\n'),
        startAt: startAt.toISOString(),
        delayBetweenSeconds: delaySeconds,
        hourlyLimit,
        senderId: fromId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not schedule these emails.');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-fadeIn">
      <form
        onSubmit={submit}
        className="bg-white border border-gray-200 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden relative flex flex-col max-h-[92vh]"
      >
        <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button type="button" onClick={onClose} className="text-gray-600 hover:text-gray-900 p-1.5 rounded-full hover:bg-gray-100 transition">
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-base font-semibold text-gray-900">Compose New Email</h2>
          </div>
          <div className="flex items-center space-x-3">
            <button type="button" title="Attach File" onClick={() => fileRef.current?.click()} className="text-gray-500 hover:text-gray-800 p-2 rounded-lg hover:bg-gray-100 transition">
              <Paperclip className="h-4 w-4" />
            </button>
            <button type="button" title="Send Later Options" onClick={() => setShowLater((value) => !value)} className="text-gray-500 hover:text-gray-800 p-2 rounded-lg hover:bg-gray-100 transition relative">
              <Clock3 className="h-4 w-4" />
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-[#00b050] hover:bg-[#009644] text-white font-medium text-xs px-4 py-2 rounded-full border border-[#00b050] transition shadow-sm disabled:opacity-50"
            >
              {submitting ? 'Scheduling…' : 'Schedule'}
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          <div className="flex items-center text-xs">
            <span className="w-16 font-medium text-gray-500">From</span>
            <label className="flex items-center space-x-2 bg-[#f4f5f7] border border-gray-200 px-3 py-1.5 rounded-xl text-gray-700 font-medium">
              <select
                value={fromId}
                onChange={(event) => setFromId(event.target.value)}
                className="bg-transparent border-0 text-xs focus:outline-none"
              >
                {senders.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fromEmail}
                  </option>
                ))}
                {senders.length === 0 && <option value="">No Ethereal sender yet</option>}
              </select>
            </label>
          </div>

          <div className="flex items-start justify-between text-xs border-b border-gray-100 pb-3 gap-3">
            <div className="flex items-center flex-1 space-x-2 flex-wrap gap-y-1.5">
              <span className="w-16 font-medium text-gray-500 shrink-0">To</span>
              {recipients.map((email) => (
                <span key={email} className="inline-flex items-center space-x-1.5 bg-[#e6f4ea] text-[#00b050] border border-[#d2ead6] text-[11px] px-3 py-1 rounded-full font-medium">
                  <span>{email}</span>
                  <button type="button" onClick={() => removeRecipient(email)} className="hover:text-red-500" aria-label={`Remove ${email}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                value={draftRecipient}
                onChange={(event) => setDraftRecipient(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ',') {
                    event.preventDefault();
                    addRecipient();
                  }
                }}
                placeholder="Add a recipient"
                className="bg-transparent border-0 text-xs text-gray-800 focus:outline-none min-w-[140px]"
              />
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center space-x-1.5 text-xs font-semibold text-[#00b050] hover:text-[#009644] shrink-0 ml-2"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload List</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
          </div>

          <div className="border-b border-gray-100 pb-3">
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Subject"
              className="w-full bg-transparent border-0 text-sm text-gray-800 placeholder-gray-400 focus:outline-none font-medium"
            />
          </div>

          <div className="flex items-center space-x-6 text-xs text-gray-600 border-b border-gray-100 pb-3 flex-wrap gap-y-2">
            <label className="flex items-center space-x-2">
              <span>Delay between 2 emails</span>
              <input
                type="number"
                min={0}
                max={86400}
                value={delaySeconds}
                onChange={(event) => setDelaySeconds(Number(event.target.value))}
                className="w-16 bg-[#f4f5f7] border border-gray-200 rounded-lg px-2 py-1 text-center font-mono font-medium text-gray-800 focus:outline-none focus:border-[#00b050]"
              />
              <span>sec</span>
            </label>
            <label className="flex items-center space-x-2">
              <span>Hourly Limit</span>
              <input
                type="number"
                min={1}
                max={100000}
                value={hourlyLimit}
                onChange={(event) => setHourlyLimit(Number(event.target.value))}
                className="w-20 bg-[#f4f5f7] border border-gray-200 rounded-lg px-2 py-1 text-center font-mono font-medium text-gray-800 focus:outline-none focus:border-[#00b050]"
              />
              <span>/ sender</span>
            </label>
            <span className="text-gray-400">{recipients.length} lead{recipients.length === 1 ? '' : 's'} · starts {formatWhen(startAt.toISOString())}</span>
          </div>

          <div className="min-h-[220px] bg-[#fdfdfd] border border-gray-100 rounded-xl p-4 flex flex-col justify-between">
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Type Your Reply..."
              className="w-full min-h-[150px] bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none resize-none font-sans leading-relaxed"
            />
            <div className="bg-white border border-gray-200 shadow-sm rounded-full px-4 py-2 flex items-center space-x-3 w-max mt-4">
              <ToolButton label="Bold" onClick={() => wrap('<strong>', '</strong>')}><Bold className="h-3.5 w-3.5" /></ToolButton>
              <ToolButton label="Italic" onClick={() => wrap('<em>', '</em>')}><Italic className="h-3.5 w-3.5" /></ToolButton>
              <ToolButton label="Underline" onClick={() => wrap('<u>', '</u>')}><Underline className="h-3.5 w-3.5" /></ToolButton>
              <span className="h-3 w-px bg-gray-200" />
              <ToolButton label="Link" onClick={() => wrap('<a href="https://">', '</a>')}><Link2 className="h-3.5 w-3.5" /></ToolButton>
              <ToolButton label="List" onClick={() => wrap('<ul><li>', '</li></ul>')}><List className="h-3.5 w-3.5" /></ToolButton>
              <ToolButton label="Numbered list" onClick={() => wrap('<ol><li>', '</li></ol>')}><ListOrdered className="h-3.5 w-3.5" /></ToolButton>
            </div>
          </div>

          {sender && (
            <p className="text-[11px] text-gray-400">
              Sending as {sender.fromEmail}. The worker will not send faster than the minimum gap, and it will move extra mail into the next hour instead of dropping it.
            </p>
          )}
          {error && <p className="bg-rose-50 border border-rose-200 text-rose-600 p-3 rounded-xl text-xs">{error}</p>}
        </div>

        {showLater && (
          <div className="absolute top-16 right-6 bg-white border border-gray-200 rounded-2xl p-5 shadow-2xl z-50 w-72 space-y-4 animate-fadeIn">
            <div className="text-xs font-bold text-gray-800">Send Later</div>
            <div className="space-y-1.5 text-xs text-gray-600">
              <Preset label="Tomorrow" onClick={() => setLaterDraft(toLocalInput(tomorrowAt(startAt.getHours(), startAt.getMinutes())))} />
              <Preset label="Tomorrow 10:00 AM" onClick={() => setLaterDraft(toLocalInput(tomorrowAt(10)))} />
              <Preset label="Tomorrow 11:00 AM" onClick={() => setLaterDraft(toLocalInput(tomorrowAt(11)))} />
            </div>
            <label className="block text-[11px] font-semibold text-gray-500">
              Pick date & time
              <input
                type="datetime-local"
                value={laterDraft}
                onChange={(event) => setLaterDraft(event.target.value)}
                className="mt-1 w-full bg-[#f4f5f7] border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 focus:outline-none focus:border-[#00b050]"
              />
            </label>
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setShowLater(false)} className="text-xs text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const parsed = new Date(laterDraft);
                  if (Number.isNaN(parsed.getTime())) {
                    setError('Pick a valid date and time.');
                    return;
                  }
                  setStartAt(parsed);
                  setShowLater(false);
                }}
                className="text-xs font-bold text-[#00b050] hover:bg-[#e6f4ea] px-4 py-1.5 rounded-full border border-[#00b050]"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

function ToolButton(props: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={props.label} onClick={props.onClick} className="text-gray-500 hover:text-gray-800">
      {props.children}
    </button>
  );
}

function Preset(props: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={props.onClick} className="block hover:text-[#00b050] text-left">
      {props.label}
    </button>
  );
}
