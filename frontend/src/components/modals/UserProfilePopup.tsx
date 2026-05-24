import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Check, LogOut } from 'lucide-react';

type Status = 'online' | 'idle' | 'dnd' | 'offline';

interface Props {
  onClose: () => void;
}

const STATUSES: { value: Status; label: string; color: string; desc: string }[] = [
  { value: 'online',  label: 'Online',          color: 'bg-discord-online',  desc: 'You appear active.' },
  { value: 'idle',    label: 'Idle',            color: 'bg-discord-idle',    desc: 'Away from keyboard.' },
  { value: 'dnd',     label: 'Do Not Disturb',  color: 'bg-discord-dnd',     desc: 'Mute notifications.' },
  { value: 'offline', label: 'Invisible',       color: 'bg-discord-text-muted', desc: 'You appear offline.' },
];

export default function UserProfilePopup({ onClose }: Props) {
  const { user, setStatus, logout } = useAuthStore();
  const ref = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState<Status | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [onClose]);

  if (!user) return null;

  const initials = user.username?.slice(0, 1).toUpperCase() || '?';
  const status: Status = (user.status as Status) || 'online';
  const statusColor = STATUSES.find(s => s.value === status)?.color || 'bg-discord-online';

  const changeStatus = async (s: Status) => {
    setSaving(s);
    try { await setStatus(s); } finally { setSaving(null); }
  };

  return (
    <div
      ref={ref}
      className="absolute bottom-16 left-2 w-80 bg-[#111214] rounded-lg shadow-2xl z-50 animate-fade-in overflow-hidden border border-black/30"
    >
      {/* Banner */}
      <div className="h-16 bg-discord-brand" />

      {/* Avatar + name */}
      <div className="px-4 pb-4 -mt-10 relative">
        <div className="relative inline-block">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-20 h-20 rounded-full border-[6px] border-[#111214] object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-full border-[6px] border-[#111214] bg-discord-brand flex items-center justify-center text-white text-3xl font-bold">
              {initials}
            </div>
          )}
          <div className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-[4px] border-[#111214] ${statusColor}`} />
        </div>

        <div className="mt-2">
          <h3 className="text-white font-bold text-lg leading-tight">{user.username}</h3>
          <p className="text-discord-text-muted text-sm">
            {user.username}#{user.discriminator || '0000'}
          </p>
          {user.email && (
            <p className="text-xs text-discord-text-muted mt-0.5 truncate">{user.email}</p>
          )}
        </div>
      </div>

      {/* Status section */}
      <div className="px-3 pb-3">
        <div className="bg-[#1e1f22] rounded-md p-2">
          <p className="text-xs font-bold text-discord-text-muted uppercase tracking-wide px-2 pb-1">
            Set Status
          </p>
          {STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => changeStatus(s.value)}
              disabled={saving !== null}
              className={`w-full flex items-center gap-3 px-2 py-2 rounded text-sm hover:bg-discord-bg-hover transition-colors ${
                status === s.value ? 'bg-discord-bg-hover' : ''
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${s.color} flex-shrink-0`} />
              <div className="flex-1 text-left">
                <p className="text-white font-medium leading-tight">{s.label}</p>
                <p className="text-xs text-discord-text-muted leading-tight">{s.desc}</p>
              </div>
              {status === s.value && (
                <Check size={16} className="text-discord-online flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Logout */}
      <div className="px-3 pb-3 border-t border-discord-bg-accent pt-2">
        <button
          onClick={() => { logout(); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-discord-danger text-sm rounded hover:bg-discord-danger/10 transition-colors"
        >
          <LogOut size={16} />
          Log Out
        </button>
      </div>
    </div>
  );
}
