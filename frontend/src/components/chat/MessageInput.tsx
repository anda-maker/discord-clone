import { useState, useRef, useCallback, useEffect } from 'react';
import { Channel, Message } from '../../types';
import { getSocket } from '../../lib/socket';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { Plus, Smile, Gift, X, Image as ImageIcon, Loader2 } from 'lucide-react';

interface Props {
  channel: Channel;
  replyTo: Message | null;
  onCancelReply: () => void;
  onSend: (content: string) => void;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export default function MessageInput({ channel, replyTo, onCancelReply, onSend }: Props) {
  const { user } = useAuthStore();
  const [content, setContent] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ url: string; previewUrl: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();
  const socket = getSocket();

  useEffect(() => {
    textareaRef.current?.focus();
  }, [channel.id]);

  const startTyping = useCallback(() => {
    if (!isTyping) {
      setIsTyping(true);
      socket.emit('typing_start', { channelId: channel.id });
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit('typing_stop', { channelId: channel.id });
    }, 3000);
  }, [isTyping, channel.id]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    if (e.target.value) startTyping();
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const uploadImage = async (file: File) => {
    if (!user) return;
    setUploadError(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Only JPG, PNG, GIF and WEBP images are allowed');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setUploadError('Image too large (max 10 MB)');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPendingImage({ url: '', previewUrl });
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `${channel.id}/${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('chat-images')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from('chat-images').getPublicUrl(path);
      setPendingImage({ url: data.publicUrl, previewUrl });
    } catch (e: any) {
      setUploadError(e?.message || 'Upload failed');
      setPendingImage(null);
      URL.revokeObjectURL(previewUrl);
    } finally {
      setUploading(false);
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow same file again
    if (file) uploadImage(file);
  };

  const removeImage = () => {
    if (pendingImage?.previewUrl) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
    setUploadError(null);
  };

  const handleSend = () => {
    // Need either text or an uploaded image
    const text = content.trim();
    const img = pendingImage?.url || '';
    if (!text && !img) return;
    if (pendingImage && !img) return; // upload still in progress

    // Compose: text on first line(s), image URL on its own trailing line.
    const composed = [text, img].filter(Boolean).join(text && img ? '\n' : '');
    onSend(composed);
    setContent('');
    removeImage();
    clearTimeout(typingTimer.current);
    setIsTyping(false);
    socket.emit('typing_stop', { channelId: channel.id });
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  return (
    <div className="px-4 pb-6 flex-shrink-0">
      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 bg-discord-bg-secondary rounded-t-lg px-4 py-2 border-b border-discord-bg-tertiary">
          <div className="text-xs text-discord-text-muted flex-1">
            Replying to <span className="font-semibold text-discord-text-normal">{replyTo.profiles?.username}</span>
            <span className="ml-2 text-discord-text-muted truncate">{replyTo.content.slice(0, 50)}{replyTo.content.length > 50 ? '…' : ''}</span>
          </div>
          <button onClick={onCancelReply} className="text-discord-text-muted hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Image preview */}
      {pendingImage && (
        <div className={`bg-discord-bg-accent px-3 pt-3 ${replyTo ? '' : 'rounded-t-lg'}`}>
          <div className="relative inline-block">
            <img
              src={pendingImage.previewUrl}
              alt="upload preview"
              className="max-h-40 rounded-md border border-discord-bg-tertiary"
            />
            {uploading && (
              <div className="absolute inset-0 bg-black/60 rounded-md flex items-center justify-center">
                <Loader2 size={24} className="text-white animate-spin" />
              </div>
            )}
            <button
              onClick={removeImage}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-discord-danger text-white flex items-center justify-center shadow-lg hover:bg-[#c93437]"
              title="Remove"
            >
              <X size={14} />
            </button>
          </div>
          {uploadError && (
            <p className="text-xs text-discord-danger mt-1">{uploadError}</p>
          )}
        </div>
      )}

      {/* Input box */}
      <div className={`flex items-end gap-2 bg-discord-bg-accent rounded-lg px-4 py-3 ${(replyTo || pendingImage) ? 'rounded-t-none' : ''}`}>
        {/* Attachment button — opens image picker */}
        <button
          onClick={() => fileRef.current?.click()}
          className="text-discord-interactive-normal hover:text-white flex-shrink-0 pb-0.5 transition-colors"
          title="Upload an image"
        >
          <Plus size={20} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleFilePick}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={`Message #${channel.name}`}
          rows={1}
          className="flex-1 bg-transparent text-discord-text-normal placeholder-discord-text-muted resize-none focus:outline-none text-sm leading-relaxed"
          style={{ maxHeight: '200px', overflowY: 'auto' }}
        />

        {/* Right side icons */}
        <div className="flex items-center gap-1 flex-shrink-0 pb-0.5">
          <button
            onClick={() => fileRef.current?.click()}
            className="text-discord-interactive-normal hover:text-white transition-colors"
            title="Upload image"
          >
            <ImageIcon size={20} />
          </button>
          <button className="text-discord-interactive-normal hover:text-white transition-colors">
            <Gift size={20} />
          </button>
          <button className="text-discord-interactive-normal hover:text-white transition-colors">
            <Smile size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
