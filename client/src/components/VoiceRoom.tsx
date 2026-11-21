import { useCallback, useEffect, useRef, useState } from 'react';
import SimplePeer from 'simple-peer';
import { Camera, CameraOff, Mic, MicOff, MonitorUp, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import type { Channel, Server, User, VoiceState } from '../types';
import { apiFetch } from '../lib/api';
import { getSocket } from '../lib/socket';
import { Avatar } from './Avatar';

type VoiceMember = {
  user: { id: number; username: string; display_name: string; avatar_url: string; avatar_color?: string };
  muted: boolean;
  deafened: boolean;
  canSpeak?: boolean;
  joined_at: string;
};

type VoiceRoomProps = {
  server: Server;
  channel: Channel;
  user: User;
  micMuted: boolean;
  deafened: boolean;
  audioInputId?: string;
  audioOutputId?: string;
  onToggleMic: () => void;
  onToggleDeafen: () => void;
  onLeave: () => void;
};

export function VoiceRoom({ server, channel, user, micMuted, deafened, audioInputId = '', audioOutputId = '', onToggleMic, onToggleDeafen, onLeave }: VoiceRoomProps) {
  const [participants, setParticipants] = useState<VoiceMember[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<number, MediaStream>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [joinedAt, setJoinedAt] = useState<number | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const peers = useRef(new Map<number, SimplePeer.Instance>());
  const localRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const cameraRef = useRef<MediaStream | null>(null);
  const joinedRef = useRef(false);
  const audioRefs = useRef<Record<number, HTMLAudioElement | null>>({});
  const analyserFrame = useRef<number | null>(null);

  const closePeer = useCallback((peerId: number) => {
    const peer = peers.current.get(peerId);
    if (peer) {
      peer.removeAllListeners();
      peer.destroy();
      peers.current.delete(peerId);
    }
    setRemoteStreams((current) => {
      const next = { ...current };
      delete next[peerId];
      return next;
    });
  }, []);

  const createPeer = useCallback((peerId: number, initiator: boolean, socket: ReturnType<typeof getSocket>) => {
    const existing = peers.current.get(peerId);
    if (existing) return existing;
    const stream = localRef.current;
    if (!stream) return null;
    const peer = new SimplePeer({ initiator, trickle: true, stream, config: {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }]
    } });
    peers.current.set(peerId, peer);
    peer.on('signal', (payload) => socket.emit('voice:signal', { channelId: channel.id, to: peerId, payload }));
    peer.on('stream', (remote) => setRemoteStreams((current) => ({ ...current, [peerId]: remote })));
    peer.on('close', () => closePeer(peerId));
    peer.on('error', (reason) => {
      setError(reason.message || 'Ошибка голосового соединения.');
      closePeer(peerId);
    });
    const display = screenRef.current;
    if (display) display.getVideoTracks().forEach((track) => peer.addTrack(track, display));
    const camera = cameraRef.current;
    if (camera) camera.getVideoTracks().forEach((track) => peer.addTrack(track, camera));
    return peer;
  }, [channel.id, closePeer]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((track) => { track.enabled = !micMuted && participants.find((p) => p.user.id === user.id)?.canSpeak !== false; });
  }, [localStream, micMuted, participants, user.id]);

  useEffect(() => {
    Object.values(audioRefs.current).forEach((audio) => {
      if (!audio) return;
      audio.muted = deafened;
      const sink = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (audioOutputId && sink.setSinkId) void sink.setSinkId(audioOutputId).catch(() => {});
    });
  }, [remoteStreams, deafened, audioOutputId]);

  useEffect(() => {
    if (!localStream) return;
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    const source = context.createMediaStreamSource(localStream);
    source.connect(analyser);
    const values = new Uint8Array(analyser.frequencyBinCount);
    let active = true;
    const sample = () => {
      if (!active) return;
      analyser.getByteFrequencyData(values);
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      setSpeaking(average > 17 && !micMuted && !deafened);
      analyserFrame.current = window.requestAnimationFrame(sample);
    };
    sample();
    return () => {
      active = false;
      if (analyserFrame.current !== null) window.cancelAnimationFrame(analyserFrame.current);
      source.disconnect();
      void context.close();
      setSpeaking(false);
    };
  }, [localStream, micMuted, deafened]);

  useEffect(() => {
    let disposed = false;
    const socket = getSocket();
    const onPeers = ({ channelId, peers: remotePeers }: { channelId: number; peers: VoiceMember[] }) => {
      if (channelId !== channel.id || disposed) return;
      setParticipants((current) => {
        const map = new Map(current.map((item) => [item.user.id, item]));
        remotePeers.forEach((item) => map.set(item.user.id, item));
        return Array.from(map.values());
      });
      remotePeers.forEach((item) => {
        if (item.user.id !== user.id) createPeer(item.user.id, true, socket);
      });
    };
    const onSignal = ({ channelId, from, payload }: { channelId: number; from: number; payload: unknown }) => {
      if (channelId !== channel.id || from === user.id || disposed) return;
      const peer = peers.current.get(from) || createPeer(from, false, socket);
      try { peer?.signal(payload as never); } catch (reason) { setError((reason as Error).message); }
    };
    const onState = ({ channelId, participants: next }: { channelId: number; participants: VoiceMember[] }) => {
      if (channelId === channel.id && !disposed) setParticipants(next);
    };
    const onLeft = ({ channelId, userId }: { channelId: number; userId: number }) => {
      if (channelId === channel.id) closePeer(userId);
    };
    socket.on('voice:peers', onPeers);
    socket.on('voice:signal', onSignal);
    socket.on('voice:state', onState);
    socket.on('voice:left', onLeft);

    async function join() {
      try {
        const audio = await navigator.mediaDevices.getUserMedia({
          audio: audioInputId ? { deviceId: { exact: audioInputId }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true },
          video: false
        });
        if (disposed) { audio.getTracks().forEach((track) => track.stop()); return; }
        localRef.current = audio;
        setLocalStream(audio);
        const response = await apiFetch(`/api/servers/${server.id}/channels/${channel.id}/voice/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ muted: micMuted, deafened })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Не удалось подключиться к голосовому каналу.');
        if (disposed) {
          await apiFetch(`/api/servers/${server.id}/channels/${channel.id}/voice/leave`, { method: 'POST' }).catch(() => {});
          return;
        }
        joinedRef.current = true;
        setJoinedAt(Date.now());
        setParticipants(payload.participants || []);
        socket.emit('channel:join', { serverId: server.id, channelId: channel.id });
        window.dispatchEvent(new CustomEvent('nexo-voice-state', { detail: {
          active: true, serverId: server.id, channelId: channel.id, serverName: server.name,
          channelName: channel.name, joinedAt: Date.now()
        } }));
      } catch (reason) {
        setError((reason as Error).message || 'Не удалось подключиться к голосовому каналу.');
        setBusy(false);
      } finally {
        if (!disposed) setBusy(false);
      }
    }
    void join();

    return () => {
      disposed = true;
      socket.off('voice:peers', onPeers);
      socket.off('voice:signal', onSignal);
      socket.off('voice:state', onState);
      socket.off('voice:left', onLeft);
      peers.current.forEach((peer) => peer.destroy());
      peers.current.clear();
      localRef.current?.getTracks().forEach((track) => track.stop());
      screenRef.current?.getTracks().forEach((track) => track.stop());
      cameraRef.current?.getTracks().forEach((track) => track.stop());
      if (joinedRef.current) {
        socket.emit('channel:leave', channel.id);
        void apiFetch(`/api/servers/${server.id}/channels/${channel.id}/voice/leave`, { method: 'POST' }).catch(() => {});
      }
      joinedRef.current = false;
      window.dispatchEvent(new CustomEvent('nexo-voice-state', { detail: { active: false, channelId: channel.id } }));
    };
  }, [server.id, server.name, channel.id, channel.name, user.id, audioInputId, createPeer, closePeer]);

  useEffect(() => {
    if (joinedRef.current) void updateVoiceState(micMuted, deafened);
  }, [micMuted, deafened]);

  async function updateVoiceState(nextMuted: boolean, nextDeafened: boolean) {
    try {
      const response = await apiFetch(`/api/servers/${server.id}/channels/${channel.id}/voice/state`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ muted: nextMuted, deafened: nextDeafened })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Не удалось изменить настройки голоса.');
      setParticipants(payload.participants || []);
    } catch (reason) { setError((reason as Error).message); }
  }

  async function toggleScreenShare() {
    try {
      if (screenStream) {
        const old = screenStream;
        peers.current.forEach((peer) => old.getVideoTracks().forEach((track) => { try { peer.removeTrack(track, old); } catch {} }));
        old.getTracks().forEach((track) => track.stop());
        screenRef.current = null;
        setScreenStream(null);
        return;
      }
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenRef.current = display;
      setScreenStream(display);
      peers.current.forEach((peer) => display.getVideoTracks().forEach((track) => peer.addTrack(track, display)));
      display.getVideoTracks()[0]?.addEventListener('ended', () => {
        peers.current.forEach((peer) => display.getVideoTracks().forEach((track) => { try { peer.removeTrack(track, display); } catch {} }));
        screenRef.current = null;
        setScreenStream(null);
      }, { once: true });
    } catch (reason) { setError((reason as Error).message || 'Не удалось начать демонстрацию экрана.'); }
  }

  async function toggleCamera() {
    try {
      if (cameraStream) {
        const old = cameraStream;
        peers.current.forEach((peer) => old.getVideoTracks().forEach((track) => { try { peer.removeTrack(track, old); } catch {} }));
        old.getTracks().forEach((track) => track.stop());
        cameraRef.current = null;
        setCameraStream(null);
        return;
      }
      const camera = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      cameraRef.current = camera;
      setCameraStream(camera);
      peers.current.forEach((peer) => camera.getVideoTracks().forEach((track) => peer.addTrack(track, camera)));
      camera.getVideoTracks()[0]?.addEventListener('ended', () => {
        peers.current.forEach((peer) => camera.getVideoTracks().forEach((track) => { try { peer.removeTrack(track, camera); } catch {} }));
        cameraRef.current = null;
        setCameraStream(null);
      }, { once: true });
    } catch (reason) { setError((reason as Error).message || 'Не удалось включить камеру.'); }
  }

  const elapsed = joinedAt ? Math.max(0, Math.floor((clock - joinedAt) / 1000)) : 0;
  const duration = `${Math.floor(elapsed / 60).toString().padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`;
  const visibleMembers = participants.length ? participants : [{ user: { id: user.id, username: user.username, display_name: user.display_name, avatar_url: user.avatar_url, avatar_color: user.avatar_color }, muted: micMuted, deafened, canSpeak: true, joined_at: new Date().toISOString() }];

  return (
    <div className="voice-room">
      <header className="voice-room-header">
        <div><span className="voice-room-indicator" /><div><strong>Голосовой · {channel.name}</strong><small>{server.name} · {duration}</small></div></div>
        <button type="button" className="voice-room-leave" onClick={onLeave} aria-label="Выйти из канала"><PhoneOff size={16} />Выйти</button>
      </header>
      {error && <p className="voice-room-error">{error}</p>}
      {busy && <p className="voice-room-loading">Подключаемся к голосовому каналу…</p>}
      <div className={screenStream || cameraStream || Object.values(remoteStreams).some((stream) => stream.getVideoTracks().length) ? 'voice-room-grid has-video' : 'voice-room-grid'}>
        {visibleMembers.map((member) => {
          const remote = remoteStreams[member.user.id];
          const isLocal = member.user.id === user.id;
          const videoStream = isLocal ? (screenStream || cameraStream) : remote;
          const hasVideo = Boolean(videoStream?.getVideoTracks().length);
          return (
            <article key={member.user.id} className={`voice-member-tile ${(isLocal && speaking) ? 'speaking' : ''} ${member.muted || !member.canSpeak ? 'muted' : ''}`}>
              {hasVideo ? <video autoPlay playsInline muted={isLocal} ref={(element) => { if (element && videoStream) element.srcObject = videoStream; }} /> : <Avatar user={member.user} size={76} />}
              <div className="voice-member-label"><strong>{isLocal ? 'Вы' : member.user.display_name || member.user.username}</strong>{(member.muted || !member.canSpeak) && <MicOff size={13} />}{member.deafened && <VolumeX size={13} />}</div>
            </article>
          );
        })}
      </div>
      {Object.entries(remoteStreams).map(([id, stream]) => <audio key={id} autoPlay ref={(element) => { if (element) { audioRefs.current[Number(id)] = element; element.srcObject = stream; element.muted = deafened; } }} />)}
      <footer className="voice-room-controls">
        <button type="button" className={micMuted ? 'is-off' : ''} onClick={onToggleMic} title={micMuted ? 'Включить микрофон' : 'Выключить микрофон'}>{micMuted ? <MicOff /> : <Mic />}<span>Микрофон</span></button>
        <button type="button" className={deafened ? 'is-off' : ''} onClick={onToggleDeafen} title={deafened ? 'Включить звук' : 'Выключить звук'}>{deafened ? <VolumeX /> : <Volume2 />}<span>Наушники</span></button>
        <button type="button" className={cameraStream ? 'is-on' : ''} onClick={() => void toggleCamera()} title={cameraStream ? 'Выключить камеру' : 'Включить камеру'}>{cameraStream ? <CameraOff /> : <Camera />}<span>Камера</span></button>
        <button type="button" className={screenStream ? 'is-on' : ''} onClick={() => void toggleScreenShare()} title={screenStream ? 'Остановить демонстрацию' : 'Демонстрация экрана'}>{screenStream ? <MonitorUp /> : <MonitorUp />}<span>Экран</span></button>
        <button type="button" className="voice-room-hangup" onClick={onLeave}><PhoneOff /><span>Выйти</span></button>
      </footer>
      {participants.length > 6 && <p className="voice-room-limit-note">Mesh-связь рассчитана на небольшие группы: комфортный предел — 5–6 участников.</p>}
    </div>
  );
}

export default VoiceRoom;
