import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Channel } from '../../types';
import { Mic, MicOff, Headphones, Settings, PhoneOff } from 'lucide-react';
import UserProfilePopup from '../modals/UserProfilePopup';

interface Props {
  voiceChannel: Channel | null;
  onLeaveVoice: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-discord-online',
  idle: 'bg-discord-idle',
  dnd: 'bg-discord-dnd',
  offline: 'bg-discord-offline',
};

export default function UserPanel({ voiceChannel, onLeaveVoice }: Props) {
  const { user } = useAuthStore();
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  if (!user) return null;

  const avatarColor = '#5865f2';
  const initials = user.username?.slice(0, 1).toUpperCase() || '?';
  const statusColor = STATUS_COLORS[user.status || 'online'] || 'bg-discord-online';

  return (
    <div className="bg-[#232428] px-2 py-2 flex-shrink-0 relative">
      {/* Voice connection indicator */}
      {voiceChannel && (
        <div className="mb-2 bg-[#1a1b1e] rounded-md p-2 border border-discord-online/40">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-discord-online animate-pulse" />
                <span className="text-xs font-bold text-discord-online uppercase tracking-wide">
                  Voice Connected
                </span>
              </div>
              <p className="text-xs text-white mt-0.5 truncate font-medium">
                {voiceChannel.name}
              </p>
            </div>
            <button
              onClick={onLeaveVoice}
              className="p-1.5 rounded hover:bg-discord-danger/20 text-discord-text-muted hover:text-discord-danger transition-colors flex-shrink-0"
              title="Disconnect"
            >
              <PhoneOff size={14} />
            </button>
          </div>
        </div>
      )}

      {/* User info */}
      <div className="flex items-center gap-2">
        <div className="relative cursor-pointer" onClick={() => setShowProfile(v => !v)}>
          {user.avatar_url ? (
            <img src={user.avatar_url} className="w-8 h-8 rounded-full" alt="" />
          ) : (
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold"
              style={{ background: avatarColor }}>
              {initials}
            </div>
          )}
          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${statusColor} border-2 border-[#232428]`} />
        </div>

        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setShowProfile(v => !v)}>
          <p className="text-sm font-semibold text-white truncate leading-tight">{user.username}</p>
          <p className="text-xs text-discord-text-muted leading-tight">
            #{user.discriminator || '0000'}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-0.5">
          <IconButton
            active={!muted}
            onClick={() => setMuted(v => !v)}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <MicOff size={16} /> : <Mic size={16} />}
          </IconButton>
          <IconButton
            active={!deafened}
            onClick={() => setDeafened(v => !v)}
            title={deafened ? 'Undeafen' : 'Deafen'}
          >
            <Headphones size={16} />
          </IconButton>
          <IconButton onClick={() => setShowProfile(v => !v)} title="User Settings">
            <Settings size={16} />
          </IconButton>
        </div>
      </div>

      {/* Profile popup */}
      {showProfile && <UserProfilePopup onClose={() => setShowProfile(false)} />}
    </div>
  );
}

function IconButton({ children, onClick, title, active = true }: {
  children: React.ReactNode; onClick: () => void; title?: string; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'text-discord-interactive-normal hover:text-white hover:bg-discord-bg-hover'
          : 'text-discord-danger hover:bg-discord-bg-hover'
      }`}
    >
      {children}
    </button>
  );
}
