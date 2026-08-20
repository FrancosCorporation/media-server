// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import type * as ReactNS from 'react';

declare module 'three/examples/jsm/geometries/RoundedBoxGeometry' {
  import { BoxGeometry } from 'three';
  export class RoundedBoxGeometry extends BoxGeometry {
    constructor(width?: number, height?: number, depth?: number, segments?: number, radius?: number);
  }
}

declare global {
  interface GCSession {
    loadMedia(request: unknown): Promise<void>;
    getCastDevice(): { friendlyName: string } | null;
  }

  interface GCCastContext {
    setOptions(opts: { receiverApplicationId: string; autoJoinPolicy: string }): void;
    getCurrentSession(): GCSession | null;
    addEventListener(type: string, listener: (event: { sessionState?: string }) => void): void;
    removeEventListener(type: string, listener: (event: { sessionState?: string }) => void): void;
  }

  interface GCCastFramework {
    CastContext: { getInstance(): GCCastContext };
    CastContextEventType: { SESSION_STATE_CHANGED: string };
    SessionState: { SESSION_STARTED: string; SESSION_RESUMED: string; SESSION_ENDED: string; SESSION_END_FAILED: string };
  }

  interface GCCastMediaInfo {
    metadata?: { title: string; images?: { src: string }[] };
  }

  interface GCCastMedia {
    DEFAULT_MEDIA_RECEIVER_APP_ID: string;
    MediaInfo: new (contentId: string, contentType: string) => GCCastMediaInfo;
    MovieMediaMetadata: new () => { title: string; images?: { src: string }[] };
    Image: new (url: string) => { src: string };
    LoadRequest: new (media: GCCastMediaInfo) => { currentTime?: number };
  }

  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    chrome?: {
      cast?: {
        AutoJoinPolicy?: { ORIGIN_SCOPED: string };
        media?: GCCastMedia;
      };
    };
    cast?: { framework?: GCCastFramework };
  }

  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        'google-cast-launcher': ReactNS.DetailedHTMLProps<
          ReactNS.HTMLAttributes<HTMLElement> & {
            '--connected-color'?: string;
            '--disconnected-color'?: string;
          },
          HTMLElement
        >;
      }
    }
  }
}
