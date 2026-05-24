import { useState } from 'react';
import { Server, Channel } from '../../types';
import { ChevronDown, Hash, Volume2, Settings, PhoneOff, Signal, Plus } from 'lucide-react';
import InviteModal from '../modals/InviteModal';
import CreateChannelModal from '../modals/CreateChannelModal';

interface Props {
  server: Server;
  selectedChannel: Channel | null;
  onSelectChannel: (c: Channel) => void;
  onJoinVoice: (c: Channel) => void;
  onChannelCreated?: (c: Channel) => void;
  voiceChannelId?: string;
  voiceChannelName?: string;
  onLeaveVoice?: () => void;
  voiceBottom: React.ReactNode;
}

export default function ChannelSidebar({
  server,
  selectedChannel,
  onSelectChannel,
  onJoinVoice,
  onChannelCreated,
  voiceChannelId,
  voiceChannelName,
  onLeaveVoice,
  voiceBottom,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [createChannel, setCreateChannel] = useState<{ category: string; type: 'text' | 'voice' } | null>(null);

  const channels = server.channels || [];
  const categories = [...new Set(channels.map(c => c.category || 'CHANNELS'))];

  const toggle = (cat: string) => setCollapsed(p => ({ ...p, [cat]: !p[cat] }));

  return (
    <div className="w-60 min-w-[240px] bg-discord-sidebar flex flex-col">
      {/* Server header */}
      <div
        className="flex items-center justify-between px-4 h-12 border-b border-discord-bg-tertiary cursor-pointer hover:bg-discord-bg-hover transition-colors"
        onClick={() => setShowSettings(!showSettings)}
      >
        <span className="font-semibold text-white truncate">{server.name}</span>
        <ChevronDown size={16} className="text-discord-interactive-normal flex-shrink-0" />
      </div>

      {/* Server settings dropdown */}
      {showSettings && (
        <div className="absolute top-12 left-72 w-52 bg-[#111214] rounded-md shadow-xl z-50 p-1 animate-fade-in">
          <button
            onClick={() => { setShowInvite(true); setShowSettings(false); }}
            className="w-full text-left px-3 py-2 text-discord-text-link text-sm rounded hover:bg-discord-bg-hover"
          >
            Invite People
          </button>
          <div className="h-px bg-discord-bg-accent my-1" />
          <div className="px-3 py-2 text-xs text-discord-text-muted">
            Invite Code: <span className="font-mono text-white">{server.invite_code}</span>
          </div>
        </div>
      )}

      {/* Channels */}
      <div className="flex-1 overflow-y-auto py-2 messages-scroll">
        {categories.map(cat => {
          const catChannels = channels.filter(c => (c.category || 'CHANNELS') === cat);
          const isCollapsed = collapsed[cat];
          const isVoiceCat = cat.toUpperCase().includes('VOICE');
          return (
            <div key={cat} className="mb-1 group/cat">
              {/* Category header (with + button on hover) */}
              <div className="flex items-center w-full px-2 py-1 text-xs font-semibold text-discord-text-muted uppercase tracking-wide">
                <button
                  onClick={() => toggle(cat)}
                  className="flex items-center gap-1 flex-1 min-w-0 hover:text-discord-interactive-hover"
                >
                  <svg
                    className={`w-2.5 h-2.5 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                    viewBox="0 0 24 24" fill="currentColor"
                  >
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  <span className="truncate">{cat}</span>
                </button>
                <button
                  onClick={() => setCreateChannel({ category: cat, type: isVoiceCat ? 'voice' : 'text' })}
                  className="ml-auto p-0.5 opacity-0 group-hover/cat:opacity-100 hover:text-white transition-opacity"
                  title={`Create ${isVoiceCat ? 'voice' : 'text'} channel`}
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Channels in category */}
              {!isCollapsed && catChannels.map(channel => {
                const inVoice = voiceChannelId === channel.id;
                return (
                  <div key={channel.id}>
                    <ChannelItem
                      channel={channel}
                      selected={selectedChannel?.id === channel.id}
                      inVoice={inVoice}
                      onClick={() => {
                        if (channel.type === 'voice') {
                          // Select + join — VoiceArea mounts immediately
                          onSelectChannel(channel);
                          onJoinVoice(channel);
                        } else {
                          onSelectChannel(channel);
                        }
                      }}
                    />
                    {inVoice && (
                      <div className="mx-3 mt-1 mb-2 bg-discord-online/10 border border-discord-online/40 rounded-md p-2 animate-fade-in">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Signal size={12} className="text-discord-online" />
                              <span className="text-[10px] font-bold text-discord-online uppercase tracking-wide">
                                Connected
                              </span>
                            </div>
                            <p className="text-xs text-white mt-0.5 truncate font-medium">
                              {voiceChannelName || channel.name} / {server.name}
                            </p>
                          </div>
                          {onLeaveVoice && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onLeaveVoice(); }}
                              className="p-1 rounded hover:bg-discord-danger/20 text-discord-text-muted hover:text-discord-danger transition-colors flex-shrink-0"
                              title="Disconnect"
                            >
                              <PhoneOff size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* User panel at bottom */}
      {voiceBottom}

      {/* Invite modal */}
      {showInvite && <InviteModal server={server} onClose={() => setShowInvite(false)} />}

      {/* Create channel modal */}
      {createChannel && (
        <CreateChannelModal
          serverId={server.id}
          initialType={createChannel.type}
          category={createChannel.category}
          onClose={() => setCreateChannel(null)}
          onCreated={(ch) => {
            setCreateChannel(null);
            onChannelCreated?.(ch);
          }}
        />
      )}
    </div>
  );
}

function ChannelItem({ channel, selected, inVoice, onClick }: {
  channel: Channel; selected: boolean; inVoice: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 w-full mx-1 px-2 py-1.5 rounded text-sm group transition-colors
        ${selected
          ? 'bg-discord-bg-hover text-discord-interactive-active'
          : 'text-discord-channel-text hover:bg-discord-bg-hover hover:text-discord-channel-hover'
        }
        ${inVoice ? '!text-discord-online' : ''}
      `}
      style={{ width: 'calc(100% - 8px)' }}
    >
      {channel.type === 'text' ? (
        <Hash size={16} className="flex-shrink-0 opacity-70" />
      ) : (
        <Volume2 size={16} className="flex-shrink-0 opacity-70" />
      )}
      <span className="truncate">{channel.name}</span>
      {inVoice && (
        <span className="ml-auto flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-discord-online animate-pulse" />
        </span>
      )}
      <Settings
        size={14}
        className="ml-auto opacity-0 group-hover:opacity-70 flex-shrink-0 hover:text-white hover:opacity-100"
      />
    </button>
  );
}
