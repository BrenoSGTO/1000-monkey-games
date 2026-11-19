import Peer, { type DataConnection } from 'peerjs';
import type { PeerEnvelope, PlayerProfile } from './types';

const MONKEY_COLORS = [
  '#facc15',
  '#4ade80',
  '#fb7185',
  '#38bdf8',
  '#f97316',
  '#c084fc',
];

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export interface PeerRoomCallbacks<TMessage = unknown> {
  onStatus?: (status: 'idle' | 'connecting' | 'connected' | 'error', detail?: string) => void;
  onPlayersChange?: (players: PlayerProfile[]) => void;
  onMessage?: (envelope: PeerEnvelope<TMessage>) => void;
}

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function randomMonkeyName(): string {
  const adjectives = ['Calvo', 'Vesgo', 'Maluco', 'Careca', 'Tonto', 'Surtado', 'Banguela', 'Zoiudo'];
  const nouns = ['Chimp', 'Macaco', 'Gorila', 'Sagui', 'Babuino', 'Orangotango'];
  const a = adjectives[Math.floor(Math.random() * adjectives.length)];
  const n = nouns[Math.floor(Math.random() * nouns.length)];
  return `${n} ${a}`;
}

export class PeerRoom<TMessage = unknown> {
  private readonly gameSlug: string;
  private peer: Peer | null = null;
  private connections = new Map<string, DataConnection>();
  private players = new Map<string, PlayerProfile>();
  private callbacks: PeerRoomCallbacks<TMessage>;

  public roomCode: string | null = null;
  public localPlayer: PlayerProfile;

  constructor(gameSlug: string, callbacks: PeerRoomCallbacks<TMessage> = {}) {
    this.gameSlug = gameSlug.replace(/[^a-z0-9-]/gi, '').toLowerCase();
    this.callbacks = callbacks;
    this.localPlayer = {
      id: `local-${Math.random().toString(36).slice(2, 8)}`,
      name: randomMonkeyName(),
      color: MONKEY_COLORS[Math.floor(Math.random() * MONKEY_COLORS.length)],
      isHost: false,
    };
  }

  getPlayers(): PlayerProfile[] {
    return Array.from(this.players.values());
  }

  setPlayerName(name: string): void {
    const clean = name.trim().slice(0, 20);
    if (!clean) return;
    this.localPlayer.name = clean;
    if (this.players.has(this.localPlayer.id)) {
      this.players.set(this.localPlayer.id, { ...this.localPlayer });
      this.broadcastRoster();
    }
  }

  private toPeerId(code: string): string {
    return `mky-${this.gameSlug}-${code.toUpperCase()}`;
  }

  async hostRoom(playerName?: string): Promise<string> {
    this.disconnect();
    if (playerName) this.localPlayer.name = playerName.trim().slice(0, 20) || this.localPlayer.name;

    const code = randomCode();
    const peerId = this.toPeerId(code);
    this.callbacks.onStatus?.('connecting', `Abrindo sala ${code}...`);

    return new Promise<string>((resolve, reject) => {
      const peer = new Peer(peerId, { config: { iceServers: ICE_SERVERS } });
      this.peer = peer;

      peer.on('open', (id) => {
        this.roomCode = code;
        this.localPlayer.id = id;
        this.localPlayer.isHost = true;
        this.players.clear();
        this.players.set(id, { ...this.localPlayer });
        this.callbacks.onStatus?.('connected', `Host da sala ${code}`);
        this.callbacks.onPlayersChange?.(this.getPlayers());
        resolve(code);
      });

      peer.on('connection', (conn) => {
        this.attachConnection(conn);
      });

      peer.on('error', (err) => {
        this.callbacks.onStatus?.('error', err.message || 'Erro WebRTC');
        reject(err);
      });
    });
  }

  async joinRoom(rawCode: string, playerName?: string): Promise<void> {
    this.disconnect();
    if (playerName) this.localPlayer.name = playerName.trim().slice(0, 20) || this.localPlayer.name;

    const code = rawCode.trim().toUpperCase().replace(/^MKY-/, '');
    if (!code) throw new Error('Codigo de sala invalido');

    const hostPeerId = this.toPeerId(code);
    this.callbacks.onStatus?.('connecting', `Entrando na sala ${code}...`);

    return new Promise<void>((resolve, reject) => {
      const peer = new Peer({ config: { iceServers: ICE_SERVERS } });
      this.peer = peer;

      peer.on('open', (id) => {
        this.roomCode = code;
        this.localPlayer.id = id;
        this.localPlayer.isHost = false;
        this.players.clear();
        this.players.set(id, { ...this.localPlayer });

        const conn = peer.connect(hostPeerId, { reliable: true });
        this.attachConnection(conn, () => {
          conn.send({
            type: '__sdk:hello',
            senderId: this.localPlayer.id,
            senderName: this.localPlayer.name,
            timestamp: Date.now(),
            payload: this.localPlayer,
          } satisfies PeerEnvelope<PlayerProfile>);
          this.callbacks.onStatus?.('connected', `Conectado na sala ${code}`);
          resolve();
        });
      });

      peer.on('error', (err) => {
        this.callbacks.onStatus?.('error', err.message || 'Falha ao conectar na sala');
        reject(err);
      });
    });
  }

  private attachConnection(conn: DataConnection, onOpen?: () => void): void {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      onOpen?.();
    });

    conn.on('data', (raw) => {
      const env = raw as PeerEnvelope<unknown>;
      if (!env || typeof env.type !== 'string') return;

      if (env.type === '__sdk:hello' && this.localPlayer.isHost) {
        const profile = env.payload as PlayerProfile;
        this.players.set(conn.peer, { ...profile, id: conn.peer, isHost: false });
        this.broadcastRoster();
        return;
      }

      if (env.type === '__sdk:roster') {
        const roster = env.payload as PlayerProfile[];
        this.players.clear();
        for (const p of roster) this.players.set(p.id, p);
        this.callbacks.onPlayersChange?.(this.getPlayers());
        return;
      }

      // Host relays messages to other guests so all players stay synced
      if (this.localPlayer.isHost) {
        for (const [peerId, other] of this.connections) {
          if (peerId !== conn.peer && other.open) {
            other.send(env);
          }
        }
      }

      this.callbacks.onMessage?.(env as PeerEnvelope<TMessage>);
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      if (this.players.delete(conn.peer)) {
        if (this.localPlayer.isHost) {
          this.broadcastRoster();
        } else {
          this.callbacks.onPlayersChange?.(this.getPlayers());
        }
      }
    });
  }

  private broadcastRoster(): void {
    const roster = this.getPlayers();
    this.callbacks.onPlayersChange?.(roster);
    const envelope: PeerEnvelope<PlayerProfile[]> = {
      type: '__sdk:roster',
      senderId: this.localPlayer.id,
      senderName: this.localPlayer.name,
      timestamp: Date.now(),
      payload: roster,
    };
    for (const conn of this.connections.values()) {
      if (conn.open) conn.send(envelope);
    }
  }

  send(type: string, payload: TMessage): void {
    const envelope: PeerEnvelope<TMessage> = {
      type,
      senderId: this.localPlayer.id,
      senderName: this.localPlayer.name,
      timestamp: Date.now(),
      payload,
    };
    for (const conn of this.connections.values()) {
      if (conn.open) conn.send(envelope);
    }
  }

  getShareUrl(): string {
    if (!this.roomCode || typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    url.searchParams.set('room', this.roomCode);
    return url.toString();
  }

  getRoomFromUrl(): string | null {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('room');
  }

  disconnect(): void {
    for (const conn of this.connections.values()) {
      try {
        conn.close();
      } catch {
        // ignore
      }
    }
    this.connections.clear();
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // ignore
      }
      this.peer = null;
    }
    this.roomCode = null;
    this.players.clear();
    this.callbacks.onStatus?.('idle');
    this.callbacks.onPlayersChange?.([]);
  }
}
