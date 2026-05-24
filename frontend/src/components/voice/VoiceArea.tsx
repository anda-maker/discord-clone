import { useState, useEffect, useRef, useCallback } from 'react';
import { Channel, Server, VoiceUser } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { getSocket } from '../../lib/socket';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Volume2, Monitor, MonitorOff,
  PartyPopper, MoreHorizontal, ChevronDown, Headphones, Users,
} from 'lucide-react';

interface Props {
  channel: Channel;
  server: Server;
  isConnected: boolean;
  onJoin: () => void;
}

// Color palette inspired by the Figma design — one solid background per tile.
const TILE_COLORS = ['#3a3a3a', '#7c8694', '#a07849', '#7a2a2c', '#3b5b6e', '#5d4e7a', '#4a6b3f', '#a04848'];
function tileColorFor(seed: string): string {
  let hash = 0;
  for (const c of seed) hash = (c.charCodeAt(0) + ((hash << 5) - hash)) | 0;
  return TILE_COLORS[Math.abs(hash) % TILE_COLORS.length];
}

// Discord-style avatar color
const AVATAR_COLORS = ['#5865f2', '#eb459e', '#fee75c', '#23a55a', '#ed4245', '#f0b232', '#3ba55d', '#9b59b6'];
function avatarColorFor(seed: string): string {
  let hash = 0;
  for (const c of seed) hash = (c.charCodeAt(0) + ((hash << 5) - hash)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface Participant {
  socketId: string;
  userId: string;
  username: string;
  avatar_url?: string;
  muted?: boolean;
  isLocal: boolean;
  stream?: MediaStream | null;
}

export default function VoiceArea({ channel, server, isConnected, onJoin }: Props) {
  const { user } = useAuthStore();
  const [voiceUsers, setVoiceUsers] = useState<VoiceUser[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [muted, setMuted] = useState(false);
  const [videoOn, setVideoOn] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const socket = getSocket();
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserCleanupsRef = useRef<Map<string, () => void>>(new Map());
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);

  // ---------- Speaking detection (Web Audio API) ----------
  const attachAnalyser = useCallback((id: string, stream: MediaStream) => {
    if (analyserCleanupsRef.current.has(id)) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
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
          if (speaking && !prev.has(id)) { const n = new Set(prev); n.add(id); return n; }
          if (!speaking && prev.has(id)) { const n = new Set(prev); n.delete(id); return n; }
          return prev;
        });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      analyserCleanupsRef.current.set(id, () => { cancelAnimationFrame(raf); try { source.disconnect(); } catch {} });
    } catch {}
  }, []);

  const detachAnalyser = useCallback((id: string) => {
    const cleanup = analyserCleanupsRef.current.get(id);
    if (cleanup) { cleanup(); analyserCleanupsRef.current.delete(id); }
  }, []);

  // ---------- WebRTC peer setup ----------
  const createPeer = useCallback((socketId: string, stream: MediaStream): RTCPeerConnection => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('webrtc_ice_candidate', { to: socketId, candidate });
    };

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      setRemoteStreams(prev => ({ ...prev, [socketId]: remoteStream }));
      attachAnalyser(socketId, remoteStream);
    };

    peersRef.current.set(socketId, pc);
    return pc;
  }, [socket, attachAnalyser]);

  const startMedia = useCallback(async (withVideo = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: withVideo ? { width: 1280, height: 720 } : false,
      });
      setLocalStream(stream);
      if (withVideo) cameraTrackRef.current = stream.getVideoTracks()[0] || null;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      attachAnalyser('local', stream);
      return stream;
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setLocalStream(stream);
        attachAnalyser('local', stream);
        return stream;
      } catch { return null; }
    }
  }, [attachAnalyser]);

  // ---------- Lifecycle: join / leave voice ----------
  useEffect(() => {
    if (!isConnected) {
      // Cleanup
      peersRef.current.forEach(pc => pc.close());
      peersRef.current.clear();
      localStream?.getTracks().forEach(t => t.stop());
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      analyserCleanupsRef.current.forEach(fn => fn());
      analyserCleanupsRef.current.clear();
      setLocalStream(null);
      setVoiceUsers([]);
      setRemoteStreams({});
      setSpeakingIds(new Set());
      setVideoOn(false);
      setScreenSharing(false);
      return;
    }

    let stream: MediaStream | null = null;

    const init = async () => {
      stream = await startMedia(false);
      socket.emit('join_voice', { channelId: channel.id });
    };

    const onPeers = async ({ peers }: { peers: VoiceUser[] }) => {
      if (!stream) return;
      for (const peer of peers) {
        const pc = createPeer(peer.socketId, stream);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc_offer', { to: peer.socketId, offer });
      }
    };

    const onUserJoined = (u: VoiceUser) => {
      setVoiceUsers(prev => [...prev.filter(x => x.socketId !== u.socketId), u]);
    };

    const onUserLeft = ({ socketId }: { socketId: string }) => {
      peersRef.current.get(socketId)?.close();
      peersRef.current.delete(socketId);
      detachAnalyser(socketId);
      setRemoteStreams(prev => { const { [socketId]: _, ...rest } = prev; return rest; });
      setVoiceUsers(prev => prev.filter(u => u.socketId !== socketId));
    };

    const onMembers = ({ members }: { members: VoiceUser[] }) => {
      setVoiceUsers(members.filter(m => m.socketId !== socket.id));
    };

    const onOffer = async ({ from, offer }: any) => {
      if (!stream) return;
      const pc = createPeer(from, stream);
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc_answer', { to: from, answer });
    };

    const onAnswer = async ({ from, answer }: any) => {
      await peersRef.current.get(from)?.setRemoteDescription(answer);
    };

    const onIce = async ({ from, candidate }: any) => {
      await peersRef.current.get(from)?.addIceCandidate(candidate);
    };

    init();

    socket.on('voice_peers', onPeers);
    socket.on('voice_user_joined', onUserJoined);
    socket.on('voice_user_left', onUserLeft);
    socket.on('voice_channel_members', onMembers);
    socket.on('webrtc_offer', onOffer);
    socket.on('webrtc_answer', onAnswer);
    socket.on('webrtc_ice_candidate', onIce);

    return () => {
      socket.off('voice_peers', onPeers);
      socket.off('voice_user_joined', onUserJoined);
      socket.off('voice_user_left', onUserLeft);
      socket.off('voice_channel_members', onMembers);
      socket.off('webrtc_offer', onOffer);
      socket.off('webrtc_answer', onAnswer);
      socket.off('webrtc_ice_candidate', onIce);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, channel.id]);

  // Keep local video element in sync when video toggles
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, videoOn, screenSharing]);

  // ---------- Controls ----------
  const toggleMute = () => {
    if (!localStream) return;
    const next = !muted;
    localStream.getAudioTracks().forEach(t => { t.enabled = !next; });
    setMuted(next);
  };

  const replaceVideoSender = (track: MediaStreamTrack | null) => {
    peersRef.current.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        sender.replaceTrack(track);
      } else if (track && localStream) {
        pc.addTrack(track, localStream);
      }
    });
  };

  const toggleVideo = async () => {
    // If currently screen-sharing, stop that first
    if (screenSharing) {
      stopScreenShare();
    }
    if (!videoOn) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
        const track = camStream.getVideoTracks()[0];
        if (!track) return;
        cameraTrackRef.current = track;
        // Add to local stream so the local preview shows it
        if (localStream) {
          localStream.getVideoTracks().forEach(t => { t.stop(); localStream.removeTrack(t); });
          localStream.addTrack(track);
          if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
        }
        replaceVideoSender(track);
        setVideoOn(true);
      } catch (e) {
        console.error('camera failed', e);
      }
    } else {
      if (localStream) {
        localStream.getVideoTracks().forEach(t => { t.stop(); localStream.removeTrack(t); });
      }
      cameraTrackRef.current = null;
      replaceVideoSender(null);
      setVideoOn(false);
    }
  };

  const stopScreenShare = () => {
    const s = screenStreamRef.current;
    if (s) s.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    if (localStream) {
      localStream.getVideoTracks().forEach(t => { t.stop(); localStream.removeTrack(t); });
    }
    // Restore camera if it was on
    if (videoOn && cameraTrackRef.current) {
      localStream?.addTrack(cameraTrackRef.current);
      replaceVideoSender(cameraTrackRef.current);
    } else {
      replaceVideoSender(null);
    }
    setScreenSharing(false);
  };

  const toggleScreenShare = async () => {
    if (screenSharing) { stopScreenShare(); return; }
    try {
      const display = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false });
      const track: MediaStreamTrack = display.getVideoTracks()[0];
      if (!track) return;
      screenStreamRef.current = display;
      // Add into local stream for preview, remove existing camera
      if (localStream) {
        localStream.getVideoTracks().forEach(t => { t.stop(); localStream.removeTrack(t); });
        localStream.addTrack(track);
        if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
      }
      replaceVideoSender(track);
      setScreenSharing(true);
      // When user stops sharing via browser UI
      track.onended = () => stopScreenShare();
    } catch (e) {
      console.error('screen share failed', e);
    }
  };

  // ---------- View: not connected ----------
  if (!isConnected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-discord-bg-primary">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-discord-bg-secondary flex items-center justify-center mb-4 mx-auto">
            <Volume2 size={36} className="text-discord-text-muted" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">{channel.name}</h2>
          <p className="text-discord-text-muted text-sm mb-6">
            Voice Channel — {server.name}
          </p>
          <button
            onClick={onJoin}
            className="px-8 py-3 bg-discord-online hover:bg-discord-online/80 text-white font-semibold rounded-md transition-colors"
          >
            Join Voice Channel
          </button>
        </div>
        {voiceUsers.length > 0 && (
          <div className="text-sm text-discord-text-muted flex items-center gap-2">
            <Users size={14} />
            {voiceUsers.length} user{voiceUsers.length !== 1 ? 's' : ''} in channel
          </div>
        )}
      </div>
    );
  }

  // ---------- View: connected (Figma-matching grid + floating controls) ----------
  const participants: Participant[] = [
    {
      socketId: 'local',
      userId: user?.id || 'me',
      username: user?.username || 'You',
      avatar_url: user?.avatar_url,
      muted,
      isLocal: true,
      stream: localStream,
    },
    ...voiceUsers.map(vu => ({
      socketId: vu.socketId,
      userId: vu.userId,
      username: vu.username,
      avatar_url: vu.avatar_url,
      muted: vu.muted,
      isLocal: false,
      stream: remoteStreams[vu.socketId] || null,
    })),
  ];

  // Grid columns based on count (matches the 2x2 Figma layout for 4 users)
  const gridCols =
    participants.length === 1 ? 'grid-cols-1' :
    participants.length === 2 ? 'grid-cols-2' :
    participants.length <= 4 ? 'grid-cols-2' :
    participants.length <= 9 ? 'grid-cols-3' : 'grid-cols-4';

  return (
    <div className="flex-1 flex flex-col bg-black relative">
      {/* Top header strip */}
      <div className="flex items-center px-4 h-12 border-b border-black/50 bg-[#0a0a0a] flex-shrink-0 z-10">
        <Volume2 size={18} className="text-discord-online mr-2" />
        <span className="font-semibold text-white">{channel.name}</span>
        <span className="mx-2 text-discord-text-muted">/</span>
        <span className="text-discord-text-muted text-sm">{server.name}</span>
        <div className="ml-3 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-discord-online animate-pulse" />
          <span className="text-xs text-discord-online font-semibold uppercase tracking-wide">
            Voice Connected
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-discord-text-muted text-sm">
          <Users size={14} />
          {participants.length}
        </div>
      </div>

      {/* Video tile grid */}
      <div className="flex-1 p-2 overflow-hidden">
        <div className={`grid ${gridCols} gap-2 w-full h-full auto-rows-fr`}>
          {participants.map(p => (
            <ParticipantTile
              key={p.socketId}
              participant={p}
              speaking={speakingIds.has(p.isLocal ? 'local' : p.socketId)}
              localVideoRef={p.isLocal ? localVideoRef : undefined}
              showVideo={p.isLocal ? (videoOn || screenSharing) : !!p.stream?.getVideoTracks().length}
            />
          ))}
        </div>
      </div>

      {/* Floating control bar (matches Figma: 3 dark pills + red leave button) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-20">
        {/* Pill 1: Mic + dropdown */}
        <div className="flex items-center bg-[#1f1f23] rounded-full h-[54px] px-1">
          <button
            onClick={toggleMute}
            title={muted ? 'Unmute' : 'Mute'}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              muted ? 'text-discord-danger' : 'text-white hover:bg-white/10'
            }`}
          >
            {muted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <div className="w-px h-7 bg-white/10" />
          <button className="w-7 h-11 flex items-center justify-center text-white/70 hover:text-white" title="Audio devices">
            <ChevronDown size={16} />
          </button>
        </div>

        {/* Pill 2: Video + Screen share + React + More */}
        <div className="flex items-center bg-[#1f1f23] rounded-full h-[54px] px-1 gap-0.5">
          <button
            onClick={toggleVideo}
            title={videoOn ? 'Stop camera' : 'Start camera'}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              videoOn ? 'text-discord-online bg-white/5' : 'text-white hover:bg-white/10'
            }`}
          >
            {videoOn ? <Video size={20} /> : <VideoOff size={20} />}
          </button>
          <button className="w-6 h-11 flex items-center justify-center text-white/70 hover:text-white" title="Video devices">
            <ChevronDown size={14} />
          </button>
          <div className="w-px h-7 bg-white/10 mx-0.5" />
          <button
            onClick={toggleScreenShare}
            title={screenSharing ? 'Stop sharing' : 'Share screen'}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              screenSharing ? 'text-discord-online bg-white/5' : 'text-white hover:bg-white/10'
            }`}
          >
            {screenSharing ? <MonitorOff size={20} /> : <Monitor size={20} />}
          </button>
          <button className="w-11 h-11 rounded-full flex items-center justify-center text-white hover:bg-white/10" title="Soundboard">
            <PartyPopper size={20} />
          </button>
          <button className="w-11 h-11 rounded-full flex items-center justify-center text-white hover:bg-white/10" title="More">
            <MoreHorizontal size={20} />
          </button>
        </div>

        {/* Pill 3: Leave call (red) */}
        <button
          onClick={onJoin}
          title="Disconnect"
          className="bg-discord-danger hover:bg-[#c93437] rounded-full h-[54px] w-[73px] flex items-center justify-center text-white transition-colors shadow-lg"
        >
          <PhoneOff size={22} />
        </button>
      </div>

      {/* Bottom-left: deafen quick toggle */}
      <button
        className="absolute bottom-6 left-6 w-11 h-11 rounded-full bg-[#1f1f23] text-white hover:bg-white/10 flex items-center justify-center z-20"
        title="Deafen"
      >
        <Headphones size={18} />
      </button>
    </div>
  );
}

// ============================================================
// Participant Tile (matches Figma: solid color bg, centered avatar)
// ============================================================
function ParticipantTile({ participant, speaking, localVideoRef, showVideo }: {
  participant: Participant;
  speaking: boolean;
  localVideoRef?: React.RefObject<HTMLVideoElement>;
  showVideo: boolean;
}) {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!participant.isLocal && remoteVideoRef.current && participant.stream) {
      remoteVideoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream, participant.isLocal]);

  const tileBg = tileColorFor(participant.userId);
  const avatarBg = avatarColorFor(participant.username);
  const initials = participant.username.slice(0, 1).toUpperCase();

  return (
    <div
      className={`relative rounded-lg overflow-hidden flex items-center justify-center transition-all duration-150 ${
        speaking ? 'ring-4 ring-discord-online' : 'ring-0'
      }`}
      style={{ background: tileBg }}
    >
      {/* Video element (always present so srcObject can mount; hidden when no video) */}
      <video
        ref={participant.isLocal ? localVideoRef : remoteVideoRef}
        autoPlay
        playsInline
        muted={participant.isLocal}
        className={`w-full h-full object-cover ${showVideo ? '' : 'hidden'}`}
      />

      {/* Avatar fallback when no video */}
      {!showVideo && (
        participant.avatar_url ? (
          <img
            src={participant.avatar_url}
            alt={participant.username}
            className="w-[90px] h-[90px] rounded-full object-cover"
          />
        ) : (
          <div
            className="w-[90px] h-[90px] rounded-full flex items-center justify-center text-white text-4xl font-bold"
            style={{ background: avatarBg }}
          >
            {initials}
          </div>
        )
      )}

      {/* Name label */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded text-xs text-white">
        {participant.muted && <MicOff size={11} className="text-discord-danger" />}
        <span className="font-medium">
          {participant.username}{participant.isLocal ? ' (you)' : ''}
        </span>
      </div>
    </div>
  );
}
