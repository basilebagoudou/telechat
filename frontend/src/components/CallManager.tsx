"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sharedRinger } from "@/lib/ringtone";
import Avatar from "./Avatar";
import type { RealtimeChannel } from "@supabase/supabase-js";

type CallType = "audio" | "video";
type CallState = "idle" | "outgoing" | "incoming" | "connecting" | "connected";

type SignalPayload = {
  from: string;
  callType?: CallType;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

// Public demo TURN server (Open Relay Project / Metered) used as a fallback so
// calls still connect across restrictive NATs (e.g. two different networks)
// when no dedicated TURN server is configured via env vars. STUN alone only
// works when at least one side has a NAT that allows direct P2P — without a
// relay, calls between e.g. a phone on mobile data and a laptop on wifi
// frequently fail to connect at all, with no error other than a stuck
// "Connexion en cours...".
const FALLBACK_TURN_SERVERS: RTCIceServer[] = [
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
];

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  ...(process.env.NEXT_PUBLIC_TURN_URL
    ? [
        {
          urls: process.env.NEXT_PUBLIC_TURN_URL,
          username: process.env.NEXT_PUBLIC_TURN_USERNAME,
          credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
        },
      ]
    : FALLBACK_TURN_SERVERS),
];

function playSafely(el: HTMLMediaElement | null) {
  // Some mobile browsers don't reliably start playback just from the
  // `autoplay` attribute when `srcObject` is assigned programmatically after
  // mount — call `.play()` explicitly. A rejected promise here (autoplay
  // still blocked) is expected sometimes and safe to ignore.
  el?.play().catch(() => {});
}

export default function CallManager({
  conversationId,
  myUserId,
  peerName,
  peerAvatarUrl,
}: {
  conversationId: string;
  myUserId: string;
  peerName: string;
  peerAvatarUrl?: string | null;
}) {
  const [state, setState] = useState<CallState>("idle");
  const [callType, setCallType] = useState<CallType>("audio");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  useEffect(() => {
    if (state === "outgoing") sharedRinger.start("ringback");
    else if (state === "incoming") sharedRinger.start("ringtone");
    else sharedRinger.stop();
  }, [state]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`call:${conversationId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "ring" }, ({ payload }) => {
        const p = payload as SignalPayload;
        setError(null);
        setCallType(p.callType ?? "audio");
        setState("incoming");
      })
      .on("broadcast", { event: "accept" }, async () => {
        await startAsCaller();
      })
      .on("broadcast", { event: "offer" }, async ({ payload }) => {
        await handleOffer(payload as SignalPayload);
      })
      .on("broadcast", { event: "answer" }, async ({ payload }) => {
        const p = payload as SignalPayload;
        if (pcRef.current && p.sdp) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(p.sdp));
          flushCandidates();
        }
      })
      .on("broadcast", { event: "ice-candidate" }, async ({ payload }) => {
        const p = payload as SignalPayload;
        if (!p.candidate) return;
        if (pcRef.current?.remoteDescription) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(p.candidate));
        } else {
          pendingCandidates.current.push(p.candidate);
        }
      })
      .on("broadcast", { event: "hangup" }, () => {
        cleanup();
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      cleanup();
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  function flushCandidates() {
    pendingCandidates.current.forEach((c) => pcRef.current?.addIceCandidate(new RTCIceCandidate(c)));
    pendingCandidates.current = [];
  }

  function createPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        channelRef.current?.send({
          type: "broadcast",
          event: "ice-candidate",
          payload: { from: myUserId, candidate: event.candidate.toJSON() },
        });
      }
    };

    pc.ontrack = (event) => {
      // Route by the track's own kind rather than the `callType` state: this
      // callback runs from a broadcast handler registered once at mount
      // (see the channel useEffect below), so any component state it closed
      // over is permanently frozen at its mount-time value — reading
      // `callType` here would almost always see the initial "audio" default,
      // regardless of the call actually in progress.
      if (event.track.kind === "video") {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
          playSafely(remoteVideoRef.current);
        }
      } else if (!remoteVideoRef.current && remoteAudioRef.current) {
        // Only needed for audio-only calls: a video call's <video> element
        // already carries this same stream's audio track, so also attaching
        // it to the <audio> element would play it twice.
        remoteAudioRef.current.srcObject = event.streams[0];
        playSafely(remoteAudioRef.current);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setError(null);
        setState("connected");
      }
      if (pc.connectionState === "failed") {
        setError("La connexion a échoué (réseau trop restrictif). Réessaie, ou vérifie votre connexion.");
        cleanup(false);
      } else if (pc.connectionState === "closed") {
        cleanup();
      }
    };

    pcRef.current = pc;
    return pc;
  }

  // Re-attach the local preview whenever its <video> element (re)mounts —
  // it only exists once `state` leaves "idle" and `callType` is "video", which
  // happens *after* getUserMedia already resolved (see startCall/acceptCall).
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      playSafely(localVideoRef.current);
    }
  }, [state, callType]);

  async function getLocalStream(type: CallType) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === "video",
    });
    localStreamRef.current = stream;
    return stream;
  }

  function describeMediaError(err: unknown) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError") return "Accès au micro/caméra refusé. Autorise-le dans les réglages du navigateur.";
    if (name === "NotFoundError") return "Aucun micro ou caméra détecté sur cet appareil.";
    if (name === "NotReadableError") return "Le micro ou la caméra est déjà utilisé par une autre application.";
    return "Impossible d'accéder au micro ou à la caméra.";
  }

  // Mobile browsers (notably iOS Safari) only grant getUserMedia when it's
  // called synchronously within a real user gesture's call stack. The old
  // flow asked for the camera/mic later, inside a Realtime broadcast
  // callback — several ticks removed from any click — which desktop Chrome
  // tolerates but mobile browsers silently refuse. Both entry points below
  // acquire the local stream immediately in the click handler itself, before
  // any signaling; startAsCaller/handleOffer then reuse that same stream.
  async function startCall(type: CallType) {
    setError(null);
    try {
      await getLocalStream(type);
    } catch (err) {
      setError(describeMediaError(err));
      return;
    }

    setCallType(type);
    setState("outgoing");
    channelRef.current?.send({
      type: "broadcast",
      event: "ring",
      payload: { from: myUserId, callType: type },
    });
  }

  async function startAsCaller() {
    try {
      const pc = createPeerConnection();
      const stream = localStreamRef.current;
      if (!stream) throw new Error("Local stream missing");
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      channelRef.current?.send({
        type: "broadcast",
        event: "offer",
        payload: { from: myUserId, sdp: offer },
      });

      setState("connecting");
    } catch (err) {
      setError(describeMediaError(err));
      channelRef.current?.send({ type: "broadcast", event: "hangup", payload: { from: myUserId } });
      cleanup(false);
    }
  }

  async function acceptCall() {
    setError(null);
    try {
      await getLocalStream(callType);
    } catch (err) {
      setError(describeMediaError(err));
      channelRef.current?.send({ type: "broadcast", event: "hangup", payload: { from: myUserId } });
      cleanup(false);
      return;
    }

    setState("connecting");
    channelRef.current?.send({ type: "broadcast", event: "accept", payload: { from: myUserId } });
  }

  async function handleOffer(payload: SignalPayload) {
    if (!payload.sdp) return;
    try {
      const pc = createPeerConnection();
      const stream = localStreamRef.current;
      if (!stream) throw new Error("Local stream missing");
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      flushCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      channelRef.current?.send({
        type: "broadcast",
        event: "answer",
        payload: { from: myUserId, sdp: answer },
      });

      setState("connecting");
    } catch (err) {
      setError(describeMediaError(err));
      channelRef.current?.send({ type: "broadcast", event: "hangup", payload: { from: myUserId } });
      cleanup(false);
    }
  }

  function declineCall() {
    channelRef.current?.send({ type: "broadcast", event: "hangup", payload: { from: myUserId } });
    cleanup();
  }

  function hangUp() {
    channelRef.current?.send({ type: "broadcast", event: "hangup", payload: { from: myUserId } });
    cleanup();
  }

  function cleanup(resetError = true) {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pendingCandidates.current = [];
    setState("idle");
    if (resetError) setError(null);
  }

  function toggleMute() {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMuted(!track.enabled);
    }
  }

  const statusText =
    state === "incoming"
      ? `${peerName} vous appelle (${callType === "video" ? "vidéo" : "audio"})`
      : state === "outgoing"
        ? `Appel en cours vers ${peerName}...`
        : state === "connecting"
          ? "Connexion en cours..."
          : state === "connected"
            ? peerName
            : "";

  return (
    <>
      <div className="flex gap-1">
        <button
          onClick={() => startCall("audio")}
          disabled={state !== "idle"}
          title="Appel audio"
          className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-tg-blue transition-colors hover:bg-tg-row-hover active:scale-95 disabled:opacity-30"
        >
          📞
        </button>
        <button
          onClick={() => startCall("video")}
          disabled={state !== "idle"}
          title="Appel vidéo"
          className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-tg-blue transition-colors hover:bg-tg-row-hover active:scale-95 disabled:opacity-30"
        >
          🎥
        </button>
      </div>

      {(state !== "idle" || error) && (
        <div className="animate-overlay-in fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/85 px-4 text-center text-white">
          {state !== "idle" && callType === "video" && !error ? (
            <div className="relative w-full max-w-2xl">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="aspect-video w-full rounded-2xl bg-black/60 object-cover"
              />
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-3 right-3 h-20 w-28 rounded-xl border-2 border-white/30 bg-black/60 object-cover sm:h-24 sm:w-32"
              />
              <div className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-sm font-medium backdrop-blur-sm">
                {statusText}
              </div>
            </div>
          ) : (
            <>
              <Avatar name={peerName} url={peerAvatarUrl} size={112} />
              <div>
                <p className="text-lg font-semibold">{peerName}</p>
                <p className="mt-1 text-sm text-white/70">
                  {state === "connected" ? "En communication" : statusText}
                </p>
              </div>
            </>
          )}
          <audio ref={remoteAudioRef} autoPlay />

          {error && (
            <p className="animate-modal-in max-w-sm rounded-xl bg-red-500/20 px-4 py-2 text-sm text-red-200">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-4">
            {state === "incoming" && (
              <>
                <CallActionButton onClick={declineCall} color="red" label="Refuser">
                  ✕
                </CallActionButton>
                <CallActionButton onClick={acceptCall} color="green" label="Répondre">
                  📞
                </CallActionButton>
              </>
            )}
            {(state === "outgoing" || state === "connecting" || state === "connected") && (
              <>
                {(state === "connecting" || state === "connected") && (
                  <CallActionButton
                    onClick={toggleMute}
                    color="neutral"
                    label={muted ? "Micro coupé" : "Couper le micro"}
                  >
                    {muted ? "🔇" : "🎤"}
                  </CallActionButton>
                )}
                <CallActionButton onClick={hangUp} color="red" label="Raccrocher">
                  ✕
                </CallActionButton>
              </>
            )}
            {state === "idle" && error && (
              <CallActionButton onClick={() => setError(null)} color="neutral" label="Fermer">
                ✕
              </CallActionButton>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function CallActionButton({
  onClick,
  color,
  label,
  children,
}: {
  onClick: () => void;
  color: "green" | "red" | "neutral";
  label: string;
  children: React.ReactNode;
}) {
  const colorClasses = {
    green: "bg-green-600 hover:bg-green-500",
    red: "bg-red-600 hover:bg-red-500",
    neutral: "bg-white/20 hover:bg-white/30",
  }[color];

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        onClick={onClick}
        title={label}
        className={`flex h-14 w-14 items-center justify-center rounded-full text-xl shadow-lg transition-transform active:scale-90 ${colorClasses}`}
      >
        {children}
      </button>
      <span className="text-xs text-white/70">{label}</span>
    </div>
  );
}
