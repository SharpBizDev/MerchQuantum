'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MAX_BUFFERED_FRAMES = 144;

type AmbientTransport = "offline" | "websocket" | "webtransport";
type AmbientConnectionState = "idle" | "connecting" | "open" | "error" | "closed";

type AmbientFrame = {
  sequence: number;
  channel: string;
  receivedAt: number;
  payload: ArrayBuffer | ArrayBufferView | null;
  metadata?: Record<string, unknown>;
};

export function useAmbientStreams() {
  const socketRef = useRef<WebSocket | null>(null);
  const transportRef = useRef<unknown>(null);
  const latestFrameRef = useRef<AmbientFrame | null>(null);
  const bufferRef = useRef<AmbientFrame[]>([]);
  const lastPublishAtRef = useRef(0);
  const sequenceRef = useRef(0);

  const [connectionState, setConnectionState] = useState<AmbientConnectionState>("idle");
  const [transport, setTransport] = useState<AmbientTransport>("offline");
  const [frameVersion, setFrameVersion] = useState(0);
  const [computerUseFallback, setComputerUseFallback] = useState(false);
  const [hostileSurfaceReason, setHostileSurfaceReason] = useState<string | null>(null);
  const [streamStats, setStreamStats] = useState({
    lastSequence: 0,
    lastReceivedAt: 0,
    bufferDepth: 0,
    framesPerSecond: 0,
  });

  const publishFrameSummary = useCallback(() => {
    const latest = latestFrameRef.current;
    if (!latest) return;

    const elapsedMs = Math.max(1, latest.receivedAt - lastPublishAtRef.current);
    lastPublishAtRef.current = latest.receivedAt;

    setFrameVersion((value) => value + 1);
    setStreamStats({
      lastSequence: latest.sequence,
      lastReceivedAt: latest.receivedAt,
      bufferDepth: bufferRef.current.length,
      framesPerSecond: Math.min(240, Math.round(1000 / elapsedMs)),
    });
  }, []);

  const pushFrame = useCallback((frame: Omit<AmbientFrame, "sequence" | "receivedAt"> & Partial<Pick<AmbientFrame, "sequence" | "receivedAt">>) => {
    const nextFrame: AmbientFrame = {
      sequence: frame.sequence ?? ++sequenceRef.current,
      receivedAt: frame.receivedAt ?? performance.now(),
      channel: frame.channel,
      payload: frame.payload,
      metadata: frame.metadata,
    };

    latestFrameRef.current = nextFrame;
    bufferRef.current = [...bufferRef.current, nextFrame].slice(-MAX_BUFFERED_FRAMES);
    queueMicrotask(publishFrameSummary);
    return nextFrame;
  }, [publishFrameSummary]);

  const disconnect = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    transportRef.current = null;
    setConnectionState("closed");
    setTransport("offline");
  }, []);

  const connect = useCallback(async (options: { url: string; transport?: AmbientTransport }) => {
    disconnect();
    setConnectionState("connecting");
    setTransport(options.transport ?? "websocket");

    if ((options.transport ?? "websocket") === "webtransport") {
      const WebTransportCtor = (globalThis as { WebTransport?: new (url: string) => unknown }).WebTransport;
      if (!WebTransportCtor) {
        setConnectionState("error");
        setTransport("offline");
        setComputerUseFallback(true);
        setHostileSurfaceReason("WebTransport unavailable in this browser surface.");
        return;
      }
      transportRef.current = new WebTransportCtor(options.url);
      setConnectionState("open");
      return;
    }

    const socket = new WebSocket(options.url);
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      setConnectionState("open");
      setComputerUseFallback(false);
      setHostileSurfaceReason(null);
    };
    socket.onerror = () => {
      setConnectionState("error");
      setComputerUseFallback(true);
      setHostileSurfaceReason("Ambient stream transport entered hostile fallback.");
    };
    socket.onclose = () => {
      setConnectionState("closed");
    };
    socket.onmessage = (event) => {
      pushFrame({
        channel: "rust-ambient",
        payload: typeof event.data === "string" ? null : event.data,
        metadata: typeof event.data === "string" ? { text: event.data } : undefined,
      });
    };
    socketRef.current = socket;
  }, [disconnect, pushFrame]);

  useEffect(() => () => disconnect(), [disconnect]);

  const controls = useMemo(() => ({
    latestFrameRef,
    connect,
    disconnect,
    pushFrame,
    drainBufferedFrames: () => bufferRef.current.slice(),
  }), [connect, disconnect, pushFrame]);

  return {
    connectionState,
    transport,
    frameVersion,
    streamStats,
    computerUseFallback,
    hostileSurfaceReason,
    setComputerUseFallback,
    setHostileSurfaceReason,
    ...controls,
  };
}

export type UseAmbientStreamsResult = ReturnType<typeof useAmbientStreams>;
