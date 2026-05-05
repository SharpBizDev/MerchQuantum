'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MAX_BUFFERED_FRAMES = 144;
const LOCAL_AMBIENT_CHANNEL = "contextquantum:ambient";
const LOCAL_AMBIENT_EVENT = "contextquantum:ambient-stream";

type AmbientTransport = "offline" | "websocket" | "webtransport" | "local-bridge";
type AmbientConnectionState = "idle" | "connecting" | "open" | "error" | "closed";

type AmbientFrame = {
  sequence: number;
  channel: string;
  receivedAt: number;
  payload: ArrayBuffer | ArrayBufferView | null;
  metadata?: Record<string, unknown>;
};

function createMetadata(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { text };
  }
}

function normalizeMetadata(payload: unknown): Record<string, unknown> {
  if (typeof payload === "string") {
    return createMetadata(payload);
  }
  if (typeof payload === "object" && payload !== null) {
    return payload as Record<string, unknown>;
  }
  return { value: payload };
}

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
        metadata: typeof event.data === "string" ? createMetadata(event.data) : undefined,
      });
    };
    socketRef.current = socket;
  }, [disconnect, pushFrame]);

  useEffect(() => {
    const handleLocalPayload = (payload: unknown) => {
      setTransport("local-bridge");
      setConnectionState("open");
      setComputerUseFallback(false);
      setHostileSurfaceReason(null);
      pushFrame({
        channel: LOCAL_AMBIENT_CHANNEL,
        payload: null,
        metadata: normalizeMetadata(payload),
      });
    };

    const channel = typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(LOCAL_AMBIENT_CHANNEL)
      : null;
    const channelHandler = (event: MessageEvent<unknown>) => {
      handleLocalPayload(event.data);
    };
    channel?.addEventListener("message", channelHandler);

    const customEventHandler = (event: Event) => {
      handleLocalPayload((event as CustomEvent<unknown>).detail);
    };

    window.addEventListener(LOCAL_AMBIENT_EVENT, customEventHandler);

    return () => {
      channel?.removeEventListener("message", channelHandler);
      channel?.close();
      window.removeEventListener(LOCAL_AMBIENT_EVENT, customEventHandler);
    };
  }, [pushFrame]);

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
