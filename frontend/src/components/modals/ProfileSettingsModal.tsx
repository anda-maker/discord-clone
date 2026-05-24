import { useState, useRef } from 'react';
import { useAuthStore } from '../../store/authStore';
import { X, Upload, Check, Camera } from 'lucide-react';

type Status = 'online' | 'idle' | 'dnd' | 'offline';

interface Props { onClose: () => void; }

const STATUSES: { value: Status; label: string; color: string }[] = [
  { value: 'online',  label: 'Online',         color: 'bg-discord-online' },
  { value: 'idle',    label: 'Idle',           color: 'bg-discord-idle' },
  { value: 'dnd',     label: 'Do Not Disturb', color: 'bg-discord-dnd' },
  { value: 'offline', label: 'Invisible',      color: 'bg-discord-offline' },
];

export default function ProfileSettingsModal({ onClose }: Props) {
  const { user, updateProfile, uploadAvatar } = useAuthStore();
  const [username, setUsername] = useState(user?.username || '');
  const [status, setStatus] = useState<Status>((user?.status as Status) || 'online');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar_url || null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const initials = (username || user.username).slice(0, 1).toUpperCase();
  const dirty =
    username !== (user.username || '') ||
    status !== (user.status || 'online') ||
    pendingFile !== null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image too large (max 5MB)');
      return;
    }
    setError(null);
    setPendingFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const patch: { username?: string; status?: Status; avatar_url?: string } = {};
      if (username && username !== user.username) patch.username = username.trim();
      if (status !== user.status) patch.status = status;
      if (pendingFile) {
        const url = await uploadAvatar(pendingFile);
        patch.avatar_url = url;
      }
      if (Object.keys(patch).length > 0) {
        await updateProfile(patch);
      }
      setPendingFile(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#313338] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-discord-bg-accent">
          <h2 className="text-xl font-bold text-white">User Profile</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-discord-text-muted hover:bg-discord-bg-hover hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Preview banner + avatar */}
        <div className="relative">
          <div className="h-24 bg-discord-brand" />
          <div className="absolute left-6 -bottom-10">
            <div className="relative group">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt=""
                  className="w-24 h-24 rounded-full border-[6px] border-[#313338] object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-full border-[6px] border-[#313338] bg-discord-brand flex items-center justify-center text-white text-4xl font-bold">
                  {initials}
                </div>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute inset-0 m-auto opacity-0 group-hover:opacity-100 bg-black/60 rounded-full flex items-center justify-center transition-opacity"
                title="Change avatar"
                style={{ width: 72, height: 72, top: 6, left: 6 }}
              >
                <Camera size={24} className="text-white" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pt-14 pb-6 space-y-6">
          {/* Identity */}
          <div>
            <p className="text-2xl font-bold text-white">{username || user.username}</p>
            <p className="text-discord-text-muted text-sm">
              {username || user.username}#{user.discriminator || '0000'}
            </p>
          </div>

          {/* Avatar upload button (visible action) */}
          <div className="bg-[#1e1f22] rounded-lg p-4">
            <p className="text-xs font-bold text-discord-text-muted uppercase tracking-wide mb-2">
              Profile Picture
            </p>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-discord-brand hover:bg-discord-brand-hover text-white rounded-md font-medium text-sm transition-colors"
            >
              <Upload size={16} />
              Upload Image
            </button>
            <p className="text-xs text-discord-text-muted mt-2">
              JPG, PNG, GIF or WEBP — up to 5 MB.
            </p>
          </div>

          {/* Username */}
          <div>
            <label className="block text-xs font-bold text-discord-text-muted uppercase tracking-wide mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              maxLength={32}
              className="w-full bg-[#1e1f22] text-white rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-discord-brand"
              placeholder="Your display name"
            />
            <p className="text-xs text-discord-text-muted mt-1">
              You'll appear as <span className="text-white font-medium">{username || user.username}#{user.discriminator || '0000'}</span>
            </p>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-bold text-discord-text-muted uppercase tracking-wide mb-2">
              Status
            </label>
            <div className="grid grid-cols-2 gap-2">
              {STATUSES.map(s => (
                <button
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-left transition-colors ${
                    status === s.value
                      ? 'bg-discord-bg-hover ring-1 ring-discord-brand'
                      : 'bg-[#1e1f22] hover:bg-discord-bg-hover'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full ${s.color} flex-shrink-0`} />
                  <span className="text-white text-sm font-medium flex-1">{s.label}</span>
                  {status === s.value && <Check size={16} className="text-discord-brand" />}
                </button>
              ))}
            </div>
          </div>

          {/* Email (read-only) */}
          {user.email && (
            <div>
              <label className="block text-xs font-bold text-discord-text-muted uppercase tracking-wide mb-2">
                Email
              </label>
              <div className="bg-[#1e1f22] text-discord-text-muted rounded-md px-3 py-2.5 text-sm">
                {user.email}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-discord-danger/20 border border-discord-danger/50 text-discord-danger rounded-md p-3 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-discord-online/20 border border-discord-online/50 text-discord-online rounded-md p-3 text-sm flex items-center gap-2">
              <Check size={16} />
              Profile saved
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-discord-bg-accent bg-[#2b2d31]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-white text-sm hover:underline"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-5 py-2 bg-discord-brand hover:bg-discord-brand-hover text-white rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
