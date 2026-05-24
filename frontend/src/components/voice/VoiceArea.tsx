import { useState, useEffect, useRef, useCallback } from 'react';
import { Channel, Server, VoiceUser } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { getSocket } from '../../lib/socket';
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  PhoneOff, Volume2, Users,
} from 'lucide-react';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  channel: Channel;
  server: Server;
  /** True when MainApp considers us connected to this voice channel. */
  isConnected: boolean;
  /** Toggle handler — called when user presses the red leave button. */
  onJoin: () => void;
}

interface Participant {
  socketId: string;   // 'local' for the current user
  userId: string;
  username: string;
  avatar_url?: string;
  muted: boolean;
  isLocal: boolean;
  stream: MediaStream | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TILE_COLORS   = ['#36393f', '#4a4a6a', '#6a4a4a', '#4a6a4a', '#6a6a4a'];
const AVATAR_COLORS = ['#5865f2', '#eb459e', '#23a55a', '#ed4245', '#f0b232', '#3ba55d', '#9b59b6'];

function hashIndex(seed: string, mod: number): number {
  let h = 0;
  for (const ch of seed) h = (ch.charCodeAt(0) + ((h << 5) - h)) | 0;
  return Math.abs(h) % mod;
}
const tileColor   = (s: string) => TILE_COLORS  [hashIndex(s, TILE_COLORS.length)];
const avatarColor = (s: string) => AVATAR_COLORS[hashIndex(s, AVATAR_COLORS.length)];

/** Dynamic grid: 1 full, 2 side-by-side, 3–4 2×2, 5–6 2×3, more wraps. */
function gridStyle(n: number): React.CSSProperties {
  if (n <= 1) return { gridTemplateColumns: '1fr',     gridTemplateRows: '1fr' };
  if (n === 2) return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr' };
  if (n <= 4) return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' };
  if (n <= 6) return { gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr 1fr' };
  return { gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VoiceArea({ channel, server, isConnected, onJoin }: Props) {
  const { user } = useAuthStore();
  const socket   = getSocket();

  // Real-time peer roster (excluding us)
  const [voiceUsers,    setVoiceUsers]    = useState<VoiceUser[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  // Local media
  const [localStream,   setLocalStream]   = useState<MediaStream | null>(null);
  const [muted,         setMuted]         = useState(false);
  const [videoOn,       setVideoOn]       = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);

  // Speaking detection
  const [speakingIds,   setSpeakingIds]   = useState<Set<string>>(new Set());

  // Refs that don't trigger re-renders
  const peersRef         = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef   = useRef<MediaStream | null>(null);
  const screenStreamRef  = useRef<MediaStream | null>(null);
  const cameraTrackRef   = useRef<MediaStreamTrack | null>(null);
  const audioCtxRef      = useRef<AudioContext | null>(null);
  const analyserCleanups = useRef<Map<string, () => void>>(new Map());

  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);

  // ─── Speaking detection (Web Audio API) ─────────────────────────────────────

  const attachSpeaking = useCallback((id: string, stream: MediaStream) => {
    if (analyserCleanups.current.has(id)) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx      = audioCtxRef.current;
      const source   = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf = 0;

      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        setSpeakingIds(prev => {
          const speaking = avg > 22;
          if (speaking  && !prev.has(id)) { const n = new Set(prev); n.add(id);    return n; }
          if (!speaking &&  prev.has(id)) { const n = new Set(prev); n.delete(id); return n; }
          return prev;
        });
        raf = requestAnimationFrame(tick);
      };

      raf = requestAnimationFrame(tick);
      analyserCleanups.current.set(id, () => {
        cancelAnimationFrame(raf);
        try { source.disconnect(); } catch {}
      });
    } catch {}
  }, []);

  const detachSpeaking = useCallback((id: string) => {
    analyserCleanups.current.get(id)?.();
    analyserCleanups.current.delete(id);
  }, []);

  // ─── WebRTC peer factory ────────────────────────────────────────────────────

  const createPeer = useCallback((socketId: string, stream: MediaStream) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('webrtc_ice_candidate', { to: socketId, candidate });
    };

    pc.ontrack = ({ streams }) => {
      const remote = streams[0];
      setRemoteStreams(prev => ({ ...prev, [socketId]: remote }));
      attachSpeaking(socketId, remote);
    };

    peersRef.current.set(socketId, pc);
    return pc;
  }, [socket, attachSpeaking]);

  /** Hot-swap the video sender on every active peer (no renegotiation). */
  const replaceVideoTrack = useCallback((track: MediaStreamTrack | null) => {
    peersRef.current.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        sender.replaceTrack(track).catch(() => {});
      } else if (track && localStreamRef.current) {
        pc.addTrack(track, localStreamRef.current);
      }
    });
  }, []);

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  const fullCleanup = useCallback(() => {
    peersRef.current.forEach(pc => pc.close());
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    cameraTrackRef.current  = null;
    analyserCleanups.current.forEach(fn => fn());
    analyserCleanups.current.clear();
    setLocalStream(null);
    setVoiceUsers([]);
    setRemoteStreams({});
    setSpeakingIds(new Set());
    setMuted(false);
    setVideoOn(false);
    setScreenSharing(false);
  }, []);

  // ─── Join / leave lifecycle ─────────────────────────────────────────────────

  useEffect(() => {
    if (!isConnected) { fullCleanup(); return; }

    let mounted = true;
    let stream: MediaStream | null = null;

    const init = async () => {
      // Start with mic only — camera is toggled on demand
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        // Permissions denied or no mic — still let the user see the room
        stream = new MediaStream();
      }
      if (!mounted) return;
      setLocalStream(stream);
      attachSpeaking('local', stream);
      socket.emit('join_voice', { channelId: channel.id });
    };

    // Existing peers already in channel → we initiate offers to them
    const onPeers = async ({ peers }: { peers: VoiceUser[] }) => {
      if (!stream) return;
      for (const peer of peers) {
        const pc    = createPeer(peer.socketId, stream);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc_offer', { to: peer.socketId, offer });
      }
    };

    // Real-time tile add
    const onUserJoined = (u: VoiceUser) => {
      setVoiceUsers(prev => [...prev.filter(x => x.socketId !== u.socketId), u]);
    };

    // Real-time tile remove
    const onUserLeft = ({ socketId }: { socketId: string }) => {
      peersRef.current.get(socketId)?.close();
      peersRef.current.delete(socketId);
      detachSpeaking(socketId);
      setRemoteStreams(prev => { const { [socketId]: _, ...rest } = prev; return rest; });
      setVoiceUsers(prev => prev.filter(u => u.socketId !== socketId));
    };

    // Authoritative sync — replaces our local roster with the server's
    const onMembers = ({ members }: { members: VoiceUser[] }) => {
      setVoiceUsers(members.filter(m => m.socketId !== socket.id));
    };

    const onOffer  = async ({ from, offer  }: { from: string; offer:  RTCSessionDescriptionInit }) => {
      if (!stream) return;
      const pc = createPeer(from, stream);
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc_answer', { to: from, answer });
    };
    const onAnswer = async ({ from, answer }: { from: string; answer: RTCSessionDescriptionInit }) =>
      { await peersRef.current.get(from)?.setRemoteDescription(answer); };
    const onIce    = async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) =>
      { try { await peersRef.current.get(from)?.addIceCandidate(candidate); } catch {} };

    init();
    socket.on('voice_peers',           onPeers);
    socket.on('voice_user_joined',     onUserJoined);
    socket.on('voice_user_left',       onUserLeft);
    socket.on('voice_channel_members', onMembers);
    socket.on('webrtc_offer',          onOffer);
    socket.on('webrtc_answer',         onAnswer);
    socket.on('webrtc_ice_candidate',  onIce);

    return () => {
      mounted = false;
      socket.off('voice_peers',           onPeers);
      socket.off('voice_user_joined',     onUserJoined);
      socket.off('voice_user_left',       onUserLeft);
      socket.off('voice_channel_members', onMembers);
      socket.off('webrtc_offer',          onOffer);
      socket.off('webrtc_answer',         onAnswer);
      socket.off('webrtc_ice_candidate',  onIce);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, channel.id]);

  // ─── Controls ───────────────────────────────────────────────────────────────

  const toggleMute = () => {
    const s = localStreamRef.current; if (!s) return;
    const next = !muted;
    s.getAudioTracks().forEach(t => { t.enabled = !next; });
    setMuted(next);
  };

  const stopScreenShare = async () => {
    const ss = screenStreamRef.current;
    if (ss) ss.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    const s = localStreamRef.current;
    if (s) {
      s.getVideoTracks().forEach(t => { t.stop(); s.removeTrack(t); });
      if (videoOn && cameraTrackRef.current) {
        s.addTrack(cameraTrackRef.current);
        replaceVideoTrack(cameraTrackRef.current);
      } else {
        replaceVideoTrack(null);
      }
      setLocalStream(new MediaStream(s.getTracks())); // force tile re-render
    }
    setScreenSharing(false);
  };

  const toggleCamera = async () => {
    if (screenSharing) await stopScreenShare();

    if (!videoOn) {
      try {
        const cam   = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
        const track = cam.getVideoTracks()[0];
        if (!track) return;
        cameraTrackRef.current = track;
        const s = localStreamRef.current;
        if (s) {
          s.getVideoTracks().forEach(t => { t.stop(); s.removeTrack(t); });
          s.addTrack(track);
          setLocalStream(new MediaStream(s.getTracks()));
        }
        replaceVideoTrack(track);
        setVideoOn(true);
      } catch (e) { console.warn('Camera access denied:', e); }
    } else {
      const s = localStreamRef.current;
      if (s) {
        s.getVideoTracks().forEach(t => { t.stop(); s.removeTrack(t); });
        setLocalStream(new MediaStream(s.getTracks()));
      }
      cameraTrackRef.current = null;
      replaceVideoTrack(null);
      setVideoOn(false);
    }
  };

  const toggleScreenShare = async () => {
    if (screenSharing) { await stopScreenShare(); return; }
    try {
      const display = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false });
      const track: MediaStreamTrack = display.getVideoTracks()[0];
      if (!track) return;
      screenStreamRef.current = display;
      const s = localStreamRef.current;
      if (s) {
        s.getVideoTracks().forEach(t => { t.stop(); s.removeTrack(t); });
        s.addTrack(track);
        setLocalStream(new MediaStream(s.getTracks()));
      }
      replaceVideoTrack(track);
      setScreenSharing(true);
      track.onended = () => stopScreenShare();
    } catch (e) { console.warn('Screen share cancelled:', e); }
  };

  // ─── Build participant list (local first, then remotes in join order) ───────

  const participants: Participant[] = [
    {
      socketId:  'local',
      userId:    user?.id       || 'me',
      username:  user?.username || 'You',
      avatar_url: user?.avatar_url,
      muted,
      isLocal: true,
      stream: localStream,
    },
    ...voiceUsers.map(vu => ({
      socketId:  vu.socketId,
      userId:    vu.userId,
      username:  vu.username,
      avatar_url: vu.avatar_url,
      muted:     vu.muted ?? false,
      isLocal:   false,
      stream:    remoteStreams[vu.socketId] ?? null,
    })),
  ];

  const count = participants.length;

  // ─── Render: full-screen call UI (no pre-join screen) ───────────────────────

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden" style={{ background: '#1a1a1a' }}>
      {/* Top strip */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 h-10 text-sm z-10"
           style={{ background: '#111111' }}>
        <Volume2 size={15} className="text-[#23a55a]" />
        <span className="font-semibold text-white">{channel.name}</span>
        <span className="text-white/30">/</span>
        <span className="text-white/50">{server.name}</span>
        {isConnected && (
          <span className="ml-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#23a55a] animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#23a55a]">Live</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-1 text-white/40">
          <Users size={13} />
          <span>{count}</span>
        </div>
      </div>

      {/* Tile grid */}
      <div className="flex-1 p-3 overflow-hidden">
        <div className="w-full h-full grid gap-3" style={gridStyle(count)}>
          {participants.map(p => (
            <Tile
              key={p.socketId}
              participant={p}
              speaking={speakingIds.has(p.isLocal ? 'local' : p.socketId)}
              hasVideo={p.isLocal
                ? (videoOn || screenSharing)
                : !!(p.stream?.getVideoTracks().length)}
            />
          ))}
        </div>
      </div>

      {/* Control bar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
        <div
          className="flex items-center gap-2 px-3 rounded-full shadow-2xl"
          style={{ background: '#111111', height: 60, border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <ControlBtn onClick={toggleMute}        active={muted}        danger={muted}        title={muted ? 'Unmute' : 'Mute'}>
            {muted ? <MicOff size={20} /> : <Mic size={20} />}
          </ControlBtn>

          <Divider />

          <ControlBtn onClick={toggleCamera}      active={videoOn}       title={videoOn ? 'Stop camera' : 'Start camera'}>
            {videoOn ? <Video size={20} /> : <VideoOff size={20} />}
          </ControlBtn>

          <ControlBtn onClick={toggleScreenShare} active={screenSharing} title={screenSharing ? 'Stop sharing' : 'Share screen'}>
            {screenSharing ? <MonitorOff size={20} /> : <Monitor size={20} />}
          </ControlBtn>

          <Divider />

          {/* Participant count */}
          <div
            className="flex items-center gap-1.5 px-3 h-10 rounded-full text-white/70 text-xs font-semibold select-none"
            style={{ background: 'rgba(255,255,255,0.05)' }}
            title={`${count} in call`}
          >
            <Users size={13} />
            {count}
          </div>

          <Divider />

          {/* Leave (red) */}
          <button
            onClick={onJoin}
            title="Leave call"
            className="flex items-center justify-center rounded-full text-white transition-opacity hover:opacity-80 active:scale-95"
            style={{ background: '#ed4245', width: 44, height: 44 }}
          >
            <PhoneOff size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

function Tile({
  participant,
  speaking,
  hasVideo,
}: {
  participant: Participant;
  speaking:    boolean;
  hasVideo:    boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (el && participant.stream && el.srcObject !== participant.stream) {
      el.srcObject = participant.stream;
    }
  }, [participant.stream]);

  const bg      = tileColor(participant.userId);
  const avatBg  = avatarColor(participant.username);
  const initial = participant.username.charAt(0).toUpperCase() || '?';

  return (
    <div
      className="relative rounded-xl overflow-hidden flex items-center justify-center transition-shadow duration-150"
      style={{
        background: bg,
        boxShadow: speaking ? '0 0 0 3px #23a55a' : '0 0 0 3px transparent',
      }}
    >
      {/* Video element — kept mounted so we don't re-attach srcObject every toggle */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={participant.isLocal}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ display: hasVideo ? 'block' : 'none' }}
      />

      {/* Avatar fallback when no video */}
      {!hasVideo && (
        participant.avatar_url ? (
          <img
            src={participant.avatar_url}
            alt={participant.username}
            className="rounded-full object-cover"
            style={{ width: 90, height: 90 }}
          />
        ) : (
          <div
            className="rounded-full flex items-center justify-center text-white font-bold text-4xl"
            style={{ width: 90, height: 90, background: avatBg }}
          >
            {initial}
          </div>
        )
      )}

      {/* Name tag */}
      <div
        className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded text-xs text-white font-medium"
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      >
        {participant.muted && <MicOff size={10} className="text-[#ed4245]" />}
        {participant.username}{participant.isLocal ? ' (you)' : ''}
      </div>
    </div>
  );
}

// ─── Small UI primitives ──────────────────────────────────────────────────────

function ControlBtn({
  children, onClick, active = false, danger = false, title,
}: {
  children: React.ReactNode;
  onClick:  () => void;
  active?:  boolean;
  danger?:  boolean;
  title?:   string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center rounded-full transition-all active:scale-95"
      style={{
        width: 44,
        height: 44,
        color:      danger ? '#ed4245' : active ? '#23a55a' : 'rgba(255,255,255,0.75)',
        background: active && !danger ? 'rgba(35,165,90,0.15)' : 'transparent',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.background = active && !danger ? 'rgba(35,165,90,0.15)' : 'transparent')}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px mx-1" style={{ height: 28, background: 'rgba(255,255,255,0.08)' }} />;
}
