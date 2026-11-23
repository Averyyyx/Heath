import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import SimplePeer from 'simple-peer';
import {
  ChevronUp, PhoneOff, MicOff, Mic, Camera, CameraOff, Monitor,
  MoreHorizontal, Minimize2, Maximize2
} from 'lucide-react';
import type { User } from '../../types';
import { Avatar } from '../Avatar';
import { Switch, Slider, Select } from '../ui';

type CallOverlayState = {
  conversationId: number;
  peer: SimplePeer.Instance | null;
  peerUserId?: number;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  peers?: Record<number, SimplePeer.Instance>;
  remoteStreams?: Record<number, MediaStream>;
  acceptedUserIds?: number[];
  departedUserIds?: number[];
  group?: boolean;
  isScreenSharing: boolean;
  initiator: boolean;
  mediaType?: 'audio' | 'video';
  startedAt: number;
};

export function CallOverlay({
  state, peer, currentUser, micMuted = false, onToggleMic, onHangUp, onShareScreen, onToggleCamera, audioOutputId, deafened, participants = []
}: {
  state: CallOverlayState;
  peer: User | null;
  participants?: User[];
  currentUser: User;
  micMuted?: boolean;
  onToggleMic?: () => void;
  onHangUp: (notifyRemote?: boolean) => void;
  onShareScreen: () => void;
  onToggleCamera: () => void;
  audioOutputId?: string;
  deafened?: boolean;
}) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [remoteVolume, setRemoteVolume] = useState(1);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [tileSize, setTileSize] = useState<'compact' | 'comfortable' | 'large'>('comfortable');
  const [clock, setClock] = useState(Date.now());
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideControlsTimerRef = useRef<number | null>(null);
  const peerName = peer?.display_name || peer?.username || 'Собеседник';
  const groupUsers = state.group
    ? participants.filter((item) => item.id !== currentUser.id && !(state.departedUserIds || []).includes(item.id))
    : peer ? [peer] : [];
  const groupStreams = state.remoteStreams || {};
  const cameraTrack = state.localStream?.getVideoTracks()[0];
  const cameraEnabled = Boolean(cameraTrack?.enabled && !state.isScreenSharing);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await overlayRef.current?.requestFullscreen?.();
    } catch (error) { console.warn('Fullscreen call view is unavailable:', error); }
  }
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === overlayRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!fullscreen) {
      setControlsVisible(true);
      if (hideControlsTimerRef.current !== null) window.clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
      return;
    }
    setControlsVisible(true);
    hideControlsTimerRef.current = window.setTimeout(() => setControlsVisible(false), 3000);
    return () => {
      if (hideControlsTimerRef.current !== null) window.clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
    };
  }, [fullscreen]);

  function revealCallControls() {
    setControlsVisible(true);
    if (hideControlsTimerRef.current !== null) window.clearTimeout(hideControlsTimerRef.current);
    if (fullscreen) hideControlsTimerRef.current = window.setTimeout(() => setControlsVisible(false), 3000);
  }
  useEffect(() => {
    state.localStream?.getAudioTracks().forEach((track) => { void track.applyConstraints({ noiseSuppression }).catch(() => {}); });
  }, [state.localStream, noiseSuppression]);

  useEffect(() => {
    if (localVideoRef.current && state.localStream) localVideoRef.current.srcObject = state.localStream;
  }, [state.localStream]);
  useEffect(() => {
    if (remoteVideoRef.current && state.remoteStream) remoteVideoRef.current.srcObject = state.remoteStream;
    if (remoteAudioRef.current && state.remoteStream) remoteAudioRef.current.srcObject = state.remoteStream;
  }, [state.remoteStream]);
  useEffect(() => {
    const media = overlayRef.current?.querySelectorAll('audio, video') || [];
    media.forEach((element) => {
      const output = element as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
      if (output.setSinkId && audioOutputId) void output.setSinkId(audioOutputId).catch((error) => console.warn('Audio output selection failed:', error));
    });
  }, [audioOutputId, state.remoteStream, state.remoteStreams]);

  useEffect(() => {
    const media = overlayRef.current?.querySelectorAll('audio, video') || [];
    media.forEach((element) => { (element as HTMLMediaElement).volume = remoteVolume; });
  }, [remoteVolume, state.remoteStream, state.remoteStreams]);

  const total = Math.max(0, Math.floor((clock - state.startedAt) / 1000));
  const duration = `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
  if (collapsed) return (
    <div className="call-overlay-collapsed">
      <span className="call-live-dot" />
      <strong>Звонок · {peerName} · {duration}</strong>
      <button type="button" className="ghost tiny" onClick={() => setCollapsed(false)}><ChevronUp size={14} />Развернуть</button>
      <button type="button" className="call-hangup-small" onClick={() => onHangUp(true)} aria-label="Завершить звонок"><PhoneOff size={16} /></button>
    </div>
  );

  return (
    <motion.section ref={overlayRef} className={`call-overlay ${fullscreen && !controlsVisible ? 'controls-hidden' : ''}`}
      onMouseMove={revealCallControls} onPointerDown={revealCallControls}
      initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
      <div className="call-banner-participants">
        <div className="call-banner-person connected"><Avatar user={currentUser} size={64} showStatus /><small>Вы</small></div>
        {state.group ? groupUsers.map((participant) => (
          <div key={participant.id} className={groupStreams[participant.id] ? 'call-banner-person connected' : 'call-banner-person pending'}>
            <Avatar user={participant} size={64} showStatus /><small>{participant.display_name || participant.username}</small>
          </div>
        )) : <div className={state.remoteStream ? 'call-banner-person connected' : 'call-banner-person pending'}><Avatar user={peer} size={64} showStatus /><small>{peerName}</small></div>}
      </div>
      {state.group ? Object.entries(groupStreams).filter(([, stream]) => !stream.getVideoTracks().length).map(([id, stream]) => (
        <audio key={id} className="call-audio-sink" autoPlay playsInline muted={deafened}
          ref={(node) => { if (node && node.srcObject !== stream) node.srcObject = stream; }} />
      )) : state.remoteStream && !state.remoteStream.getVideoTracks().length && <audio ref={remoteAudioRef} className="call-audio-sink" autoPlay playsInline muted={deafened} />}
      {(state.remoteStream?.getVideoTracks().length || cameraTrack || Object.values(groupStreams).some((stream) => stream.getVideoTracks().length)) ? <div className={`call-banner-media ${tileSize} ${state.group ? 'group' : ''}`}>
        {state.group ? Object.entries(groupStreams).filter(([, stream]) => stream.getVideoTracks().length).map(([id, stream]) => (
          <video key={id} autoPlay playsInline muted={deafened} ref={(node) => { if (node && node.srcObject !== stream) node.srcObject = stream; }} />
        )) : state.remoteStream?.getVideoTracks().length ? <video ref={remoteVideoRef} autoPlay playsInline muted={deafened} /> : null}
        {cameraTrack && <video ref={localVideoRef} className="call-local-preview" autoPlay playsInline muted />}
      </div> : null}
      <div className="call-banner-controls">
        <div className="call-control-group">
          <button type="button" className={micMuted ? 'call-control danger' : 'call-control'} onClick={onToggleMic} data-tooltip={micMuted ? 'Включить микрофон' : 'Выключить микрофон'} aria-label={micMuted ? 'Включить микрофон' : 'Выключить микрофон'}>
            {micMuted ? <MicOff size={17} /> : <Mic size={17} />}
          </button>
          <button type="button" className={cameraEnabled ? 'call-control' : 'call-control danger'} onClick={onToggleCamera}
            disabled={state.isScreenSharing} data-tooltip={cameraEnabled ? 'Выключить камеру' : 'Включить камеру'} aria-label={cameraEnabled ? 'Выключить камеру' : 'Включить камеру'}>
            {cameraEnabled ? <Camera size={17} /> : <CameraOff size={17} />}
          </button>
        </div>
        <div className="call-control-group">
          <button type="button" className="call-control" onClick={onShareScreen} data-tooltip="Поделиться экраном" aria-label="Поделиться экраном"><Monitor size={17} /></button>
          <div className="call-more-wrap">
            <button type="button" className="call-control" onClick={() => setMoreOpen((value) => !value)} data-tooltip="Дополнительные настройки" aria-label="Дополнительные настройки"><MoreHorizontal size={17} /></button>
            {moreOpen && <div className="call-more-popover">
              <div><span>Шумоподавление</span><Switch checked={noiseSuppression} onChange={setNoiseSuppression} label="Шумоподавление" /></div>
              <Slider label="Громкость собеседника" min={0} max={1} step={0.05} value={remoteVolume} valueLabel={`${Math.round(remoteVolume * 100)}%`} onChange={setRemoteVolume} />
              <label><span>Размер плитки</span><Select value={tileSize} onChange={(event) => setTileSize(event.target.value as typeof tileSize)}><option value="compact">Компактный</option><option value="comfortable">Обычный</option><option value="large">Крупный</option></Select></label>
            </div>}
          </div>
          <button type="button" className="call-control" onClick={() => void toggleFullscreen()} data-tooltip={fullscreen ? 'Свернуть звонок' : 'Развернуть звонок'} aria-label={fullscreen ? 'Свернуть звонок' : 'Развернуть звонок'}>{fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
          <button type="button" className="call-control" onClick={() => setCollapsed(true)} data-tooltip="Свернуть панель звонка" aria-label="Свернуть панель звонка"><ChevronUp size={17} /></button>
        </div>
        <button type="button" className="call-control call-hangup" onClick={() => onHangUp(true)} data-tooltip="Завершить звонок" aria-label="Завершить звонок"><PhoneOff size={17} /></button>
      </div>
      <span className="call-banner-duration">{duration}</span>
    </motion.section>
  );
}