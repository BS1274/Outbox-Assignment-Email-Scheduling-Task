import { useState, type ReactNode } from 'react';
import { Activity, ChevronDown, Clock, Inbox, LogOut, Send, Slack } from 'lucide-react';
import { API_BASE } from '../api';
import type { Bucket, Sender, SessionUser } from '../types';

type Props = {
  user: SessionUser;
  senders: Sender[];
  activeSenderId: string;
  counts: { all: number; scheduled: number; sent: number };
  bucket: Bucket;
  onBucket: (bucket: Bucket) => void;
  onSender: (senderId: string) => void;
  onCompose: () => void;
  onSlack: () => void;
  onLogout: () => void;
};

export function Sidebar(props: Props) {
  const active = props.senders.find((sender) => sender.id === props.activeSenderId) || props.senders[0];

  return (
    <aside className="w-full lg:w-64 bg-[#fafafa] border-b lg:border-b-0 lg:border-r border-gray-100 p-5 flex flex-col justify-between lg:shrink-0 lg:h-screen lg:sticky lg:top-0">
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <span className="text-2xl font-black tracking-tighter text-black">ONE</span>
          <span className="h-2 w-2 rounded-full bg-[#00b050]" />
        </div>
        <SenderMenu
          user={props.user}
          senders={props.senders}
          active={active}
          onSender={props.onSender}
          onLogout={props.onLogout}
        />
        <button
          onClick={props.onCompose}
          className="w-full border-2 border-[#00b050] text-[#00b050] hover:bg-[#e6f4ea] font-semibold text-xs py-2.5 px-4 rounded-full transition text-center"
        >
          Compose
        </button>
        <div className="space-y-1 pt-2">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 mb-2">Core</div>
          <NavButton
            label="All Mails"
            count={props.counts.all}
            active={props.bucket === 'all'}
            icon={<Inbox className="h-4 w-4" />}
            onClick={() => props.onBucket('all')}
          />
          <NavButton
            label="Scheduled"
            count={props.counts.scheduled}
            active={props.bucket === 'scheduled'}
            icon={<Clock className="h-4 w-4" />}
            onClick={() => props.onBucket('scheduled')}
          />
          <NavButton
            label="Sent"
            count={props.counts.sent}
            active={props.bucket === 'sent'}
            icon={<Send className="h-4 w-4" />}
            onClick={() => props.onBucket('sent')}
          />
        </div>
        <div className="space-y-1 pt-4 border-t border-gray-200/60">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 mb-2">Utilities</div>
          <a
            href={`${API_BASE}/admin/queues`}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-xl"
          >
            <span className="flex items-center space-x-2.5">
              <Activity className="h-4 w-4 text-emerald-600" />
              <span>BullMQ Board</span>
            </span>
          </a>
          <button
            onClick={props.onSlack}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-xl"
          >
            <span className="flex items-center space-x-2.5">
              <Slack className="h-4 w-4 text-indigo-600" />
              <span>Slack Alerts</span>
            </span>
          </button>
        </div>
      </div>
      <button
        onClick={props.onLogout}
        className="flex items-center space-x-2 text-xs text-gray-400 hover:text-rose-600 px-3 py-2 transition mt-6"
      >
        <LogOut className="h-4 w-4" />
        <span>Log out</span>
      </button>
    </aside>
  );
}

function NavButton(props: {
  label: string;
  count: number;
  active: boolean;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={props.onClick}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition ${
        props.active ? 'bg-[#e6f4ea] text-[#00b050]' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <span className="flex items-center space-x-2.5">
        {props.icon}
        <span>{props.label}</span>
      </span>
      <span className="text-[11px] font-medium text-gray-400">{props.count}</span>
    </button>
  );
}

function SenderMenu(props: {
  user: SessionUser;
  senders: Sender[];
  active?: Sender;
  onSender: (senderId: string) => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="w-full bg-[#f4f5f7] hover:bg-[#eaecef] border border-gray-200/60 rounded-xl p-2.5 flex items-center justify-between transition text-left"
      >
        <span className="flex items-center space-x-2.5 truncate">
          {props.user.avatarUrl ? (
            <img src={props.user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
          ) : (
            <span className="h-8 w-8 rounded-full bg-[#00b050] text-white text-xs font-bold flex items-center justify-center shrink-0">
              {props.user.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="truncate text-left">
            <span className="block text-xs font-bold text-gray-900 truncate">{props.user.name}</span>
            <span className="block text-[10px] text-gray-500 truncate">{props.user.email}</span>
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-14 bg-white border border-gray-200 shadow-xl rounded-2xl p-2 w-full z-50 space-y-1 text-xs animate-fadeIn">
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="text-[10px] uppercase font-bold text-gray-400">Active Sender</div>
            <div className="font-bold text-gray-900 truncate">{props.active?.fromName || 'No mailbox yet'}</div>
            <div className="text-[11px] text-gray-500 truncate">{props.active?.fromEmail || 'Create one from Compose'}</div>
          </div>
          {props.senders.map((sender) => (
            <button
              key={sender.id}
              onClick={() => {
                props.onSender(sender.id);
                setOpen(false);
              }}
              className="w-full flex items-center space-x-2 px-3 py-2 hover:bg-gray-100 rounded-xl text-gray-700 font-medium transition text-left"
            >
              <span className={`h-2 w-2 rounded-full ${sender.id === props.active?.id ? 'bg-[#00b050]' : 'bg-gray-300'}`} />
              <span className="truncate">{sender.fromEmail}</span>
            </button>
          ))}
          <button
            onClick={props.onLogout}
            className="w-full flex items-center space-x-2 px-3 py-2 hover:bg-rose-50 text-rose-600 rounded-xl font-medium transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Log Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
