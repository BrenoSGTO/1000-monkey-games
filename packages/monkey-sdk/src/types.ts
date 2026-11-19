export type GameCategory =
  | 'estrategia'
  | 'fisica'
  | 'acao'
  | 'ritmo'
  | 'simulacao'
  | 'arcade';

export type GameStatus = 'playable' | 'coming-soon';

export interface GameManifest {
  slug: string;
  title: string;
  subtitle: string;
  inspiredBy: string;
  description: string;
  category: GameCategory;
  tags: string[];
  emoji: string;
  accentColor: string;
  multiplayer: {
    supported: boolean;
    mode: 'coop' | 'versus' | 'coop-versus' | 'solo';
    maxPlayers: number;
    summary: string;
  };
  controls: string[];
  /** Relative thumbnail file inside games/<slug>/ (e.g. "thumbnail.svg") */
  thumbnail?: string;
  status: GameStatus;
  version?: string;
}

export interface CatalogGame extends GameManifest {
  /** Resolved URL used by the portal iframe or link */
  entryUrl?: string;
  /** External URL (e.g. standalone repo hosted on GitHub Pages) */
  externalUrl?: string;
  /** Resolved thumbnail path relative to portal root */
  resolvedThumbnail?: string;
  /** Featured badge on portal */
  featured?: boolean;
}

export interface PlayerProfile {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
}

export interface PeerEnvelope<TPayload = unknown> {
  type: string;
  senderId: string;
  senderName: string;
  timestamp: number;
  payload: TPayload;
}
