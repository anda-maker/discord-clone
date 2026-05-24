import { useState } from 'react';
import { X, Hash, Volume2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Channel } from '../../types';

interface Props {
  serverId: string;
  initialType?: 'text' | 'voice';
  category?: string;
  onClose: () => void;
  onCreated: (channel: Channel) => void;
}

export default function CreateChannelModal({ serverId, initialType = 'text', category, onClose, onCreated }: Props) {
  const [type, setType] = useState<'text' | 'voice'>(initialType);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const channel = await api.post('/api/channels', {
        server_id: serverId,
        name: name.trim(),
        type,
        category,
      });
      onCreated(channel);
    } catch (e: any) {
      setError(e?.message || 'Could not create channel');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#313338] rounded-lg w-full max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-2">
          <div>
            <h2 className="text-xl font-bold text-white">Create Channel</h2>
            {category && (
              <p className="text-discord-text-muted text-xs mt-1">in {category}</p>
            )}
          </div>
          <button onClick={onClose} className="text-discord-text-muted hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4">
          {/* Channel type */}
          <div>
            <label className="block text-xs font-bold text-discord-text-muted uppercase tracking-wide mb-2">
              Channel Type
            </label>
            <div className="space-y-2">
              <TypeOption
                selected={type === 'text'}
                onClick={() => setType('text')}
                icon={<Hash size={20} />}
                title="Text"
                desc="Send messages, images, GIFs, emoji, opinions, and puns"
              />
              <TypeOption
                selected={type === 'voice'}
                onClick={() => setType('voice')}
                icon={<Volume2 size={20} />}
                title="Voice"
                desc="Hang out together with voice, video, and screen share"
              />
            </div>
          </div>

          {/* Channel name */}
          <div>
            <label className="block text-xs font-bold text-discord-text-muted uppercase tracking-wide mb-2">
              Channel Name
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-discord-text-muted">
                {type === 'text' ? <Hash size={16} /> : <Volume2 size={16} />}
              </span>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={type === 'text' ? 'new-channel' : 'General'}
                className="w-full bg-[#1e1f22] text-white rounded-md pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-discord-brand"
                maxLength={50}
                autoFocus
                required
              />
            </div>
          </div>

          {error && (
            <div className="bg-discord-danger/20 border border-discord-danger/50 text-discord-danger rounded-md p-2.5 text-sm">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-white text-sm hover:underline"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="px-5 py-2 bg-discord-brand hover:bg-discord-brand-hover text-white rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TypeOption({ selected, onClick, icon, title, desc }: {
  selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-3 w-full px-3 py-3 rounded-md text-left transition-colors ${
        selected ? 'bg-discord-bg-hover ring-1 ring-discord-brand' : 'bg-[#1e1f22] hover:bg-discord-bg-hover'
      }`}
    >
      <div className={`mt-0.5 ${selected ? 'text-discord-brand' : 'text-discord-text-muted'}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-sm">{title}</p>
        <p className="text-xs text-discord-text-muted">{desc}</p>
      </div>
    </button>
  );
}
