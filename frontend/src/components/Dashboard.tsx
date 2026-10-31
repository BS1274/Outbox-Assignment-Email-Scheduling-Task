import { useEffect, useState } from 'react';
import { RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { api } from '../api';
import type { Bucket, EmailJob, EmailStatus, Sender, SessionUser, Summary } from '../types';
import { Sidebar } from './Sidebar';
import { ComposeModal } from './ComposeModal';
import { SlackModal } from './SlackModal';
import { EmailList } from './EmailList';
import { EmailDetail } from './EmailDetail';

const FILTERS: Array<{ value: EmailStatus | ''; label: string }> = [
  { value: '', label: 'All Statuses' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'sending', label: 'Sending' },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
];

export function Dashboard(props: { user: SessionUser; onUser: (user: SessionUser) => void; onLogout: () => void; notice: string }) {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [senderId, setSenderId] = useState('');
  const [bucket, setBucket] = useState<Bucket>('all');
  const [status, setStatus] = useState<EmailStatus | ''>('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [emails, setEmails] = useState<EmailJob[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [engine, setEngine] = useState<'postgres' | 'elasticsearch'>('postgres');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(props.notice);
  const [composeOpen, setComposeOpen] = useState(false);
  const [slackOpen, setSlackOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [slackConfigured, setSlackConfigured] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function reload() {
    const [summaryResult, listResult, slack] = await Promise.all([
      api.summary(),
      api.emails({
        bucket,
        status,
        senderId: senderId || undefined,
        q: debouncedQuery,
        sort,
      }),
      api.slackStatus(),
    ]);
    setSummary(summaryResult);
    setEmails(listResult.emails);
    setEngine(listResult.engine);
    setSlackConfigured(slack.configured);
    props.onUser({
      ...props.user,
      slackConnected: slack.connected,
      slackTeamName: slack.teamName,
      slackChannel: slack.channel,
    });
    setSelectedId((current) => current || listResult.emails[0]?.id || '');
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reload()
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load dashboard data.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const timer = window.setInterval(() => {
      reload().catch(() => undefined);
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // The interval should follow the filters. reload closes over them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, status, sort, senderId, debouncedQuery]);

  async function prepareSenders() {
    setProvisioning(true);
    setError('');
    try {
      const result = await api.ensureSenders();
      setSenders(result.senders);
      setSenderId((current) => current || result.senders[0]?.id || '');
      return result.senders;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create Ethereal mailboxes.');
      return [];
    } finally {
      setProvisioning(false);
    }
  }

  useEffect(() => {
    api.senders().then((result) => {
      setSenders(result.senders);
      setSenderId((current) => current || result.senders[0]?.id || '');
    }).catch(() => undefined);
  }, []);

  const selected = emails.find((email) => email.id === selectedId) || null;
  const bucketLabel = bucket === 'all' ? 'all' : bucket;

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col lg:flex-row font-sans antialiased">
      <Sidebar
        user={props.user}
        senders={senders}
        activeSenderId={senderId}
        counts={summary?.counts || { all: 0, scheduled: 0, sent: 0 }}
        bucket={bucket}
        onBucket={(next) => {
          setBucket(next);
          setStatus('');
          setSelectedId('');
        }}
        onSender={setSenderId}
        onCompose={() => {
          if (senders.length === 0) {
            void prepareSenders().then((created) => {
              if (created.length) setComposeOpen(true);
            });
            return;
          }
          setComposeOpen(true);
        }}
        onSlack={() => setSlackOpen(true)}
        onLogout={props.onLogout}
      />
      <main className="flex-1 flex flex-col min-w-0 bg-white min-h-screen">
        <header className="px-8 py-4 border-b border-gray-100 flex items-center justify-between bg-white relative gap-4">
          <div className="relative w-full max-w-md">
            <Search className="h-4 w-4 absolute left-3.5 top-2.5 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search recipient, subject, body..."
              className="w-full bg-[#f4f5f7] border-0 rounded-full pl-10 pr-4 py-2 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00b050]"
            />
          </div>
          <div className="flex items-center space-x-3 text-gray-500 relative">
            {summary && (
              <span className="hidden md:inline text-[11px] font-semibold text-[#00b050] bg-[#e6f4ea] px-3 py-1 rounded-full border border-[#d2ead6]">
                {summary.queue.active > 0 ? `Sending ${summary.queue.active}` : `Queue ${summary.queue.delayed} delayed`}
              </span>
            )}
            <button title="Refresh & Sync Queue" onClick={() => void reload()} className="p-2 hover:bg-gray-100 rounded-full transition text-gray-600 hover:text-[#00b050] active:scale-95">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button title="Filter & Sort Email Jobs" onClick={() => setFilterOpen((value) => !value)} className="p-2 rounded-full transition text-gray-600 hover:text-[#00b050] active:scale-95">
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-10 bg-white border border-gray-200 shadow-xl rounded-2xl p-4 w-60 z-50 space-y-3 text-xs animate-fadeIn">
                <div className="font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center justify-between">
                  Filter & Sort Jobs
                  <button onClick={() => setFilterOpen(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <label className="block">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Status Filter</span>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value as EmailStatus | '')}
                    className="w-full bg-[#f4f5f7] border border-gray-200 rounded-lg p-2 text-xs text-gray-800 focus:outline-none focus:border-[#00b050]"
                  >
                    {FILTERS.map((filter) => (
                      <option key={filter.label} value={filter.value}>
                        {filter.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Sort Order</span>
                  <div className="flex items-center space-x-2">
                    <SortButton active={sort === 'newest'} onClick={() => setSort('newest')}>Newest</SortButton>
                    <SortButton active={sort === 'oldest'} onClick={() => setSort('oldest')}>Oldest</SortButton>
                  </div>
                </div>
              </div>
            )}
          </div>
        </header>
        {(error || notice || provisioning) && (
          <div className="px-8 py-2 text-xs">
            {provisioning && <p className="text-gray-500">Creating Ethereal sender mailboxes…</p>}
            {notice && <p className="text-[#00b050]">{notice}</p>}
            {error && <p className="text-rose-600">{error}</p>}
            {debouncedQuery && (
              <p className="text-gray-400">Search engine: {engine === 'elasticsearch' ? 'Elasticsearch' : 'Postgres fallback'}</p>
            )}
          </div>
        )}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          <div className="lg:w-1/2 lg:border-r border-gray-100 overflow-y-auto divide-y divide-gray-100 max-h-[50vh] lg:max-h-none">
            <EmailList
              emails={emails}
              loading={loading && emails.length === 0}
              emptyLabel={`No email jobs found under "${bucketLabel}". Click "Compose" to schedule new emails.`}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
          <div className="lg:w-1/2 p-8 overflow-y-auto bg-white flex flex-col justify-between min-h-[320px]">
            <EmailDetail email={selected} />
          </div>
        </div>
      </main>
      {composeOpen && (
        <ComposeModal
          senders={senders}
          senderId={senderId}
          onClose={() => setComposeOpen(false)}
          onSchedule={async (input) => {
            const result = await api.schedule(input);
            const cap = result.hourlyLimitCapped ? ` Hourly limit was capped at ${result.hourlyLimit} per sender.` : '';
            setNotice(`Scheduled ${result.total} email${result.total === 1 ? '' : 's'}.${cap}`);
            setError('');
            setComposeOpen(false);
            setBucket('scheduled');
            await reload();
          }}
        />
      )}
      {slackOpen && (
        <SlackModal
          configured={slackConfigured}
          connected={props.user.slackConnected}
          teamName={props.user.slackTeamName}
          channel={props.user.slackChannel}
          onClose={() => setSlackOpen(false)}
          onDisconnect={async () => {
            await api.disconnectSlack();
            props.onUser({ ...props.user, slackConnected: false, slackTeamName: null, slackChannel: null });
            setNotice('Slack disconnected. Rate-limit hits will stay quiet until you connect again.');
            setSlackOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SortButton(props: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      onClick={props.onClick}
      className={`flex-1 py-1.5 px-2 text-center rounded-lg border font-semibold ${
        props.active ? 'bg-[#e6f4ea] text-[#00b050] border-[#d2ead6]' : 'bg-white text-gray-600 border-gray-200'
      }`}
    >
      {props.children}
    </button>
  );
}
