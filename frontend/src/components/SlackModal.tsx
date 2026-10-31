import { Slack, X } from 'lucide-react';
import { API_BASE } from '../api';

type Props = {
  configured: boolean;
  connected: boolean;
  teamName: string | null;
  channel: string | null;
  onClose: () => void;
  onDisconnect: () => Promise<void>;
};

export function SlackModal(props: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl relative">
        <button onClick={props.onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-slate-800">
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-center space-x-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Slack className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Slack Rate Limit Alerts</h2>
            <p className="text-xs text-slate-400">Receive instant Slack notifications when limits are hit</p>
          </div>
        </div>
        {props.connected ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-300">
              Connected{props.teamName ? ` to ${props.teamName}` : ''}
              {props.channel ? ` · ${props.channel}` : ''}. The next time a sender hits the hourly cap, this channel gets one message.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button onClick={props.onClose} className="text-xs text-slate-400 hover:text-white px-3 py-2 rounded-lg transition">
                Close
              </button>
              <button
                onClick={() => void props.onDisconnect()}
                className="text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-400 px-3 py-2 rounded-lg border border-slate-700 transition"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Connect Slack opens the real Slack authorize screen. You pick the channel there. If Slack is not connected, rate-limit hits stay quiet and the emails are still rescheduled.
            </p>
            {!props.configured && (
              <p className="text-[11px] text-amber-300">
                Add SLACK_CLIENT_ID and SLACK_CLIENT_SECRET to `.env` before connecting. The scope to request is `incoming-webhook`.
              </p>
            )}
            <div className="flex items-center justify-end pt-2">
              <a
                href={`${API_BASE}/api/slack/connect`}
                className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg shadow-emerald-600/20 transition"
              >
                Connect Slack
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
