/// <reference types="vite/client" />

interface Window {
  opmDesktop?: {
    openSettings(): Promise<void>;
    onPrepare(callback: (nonce: string) => void | Promise<void>): () => void;
    prepared(nonce: string, accepted: boolean): void;
  };
  __OPM_LOCAL_SESSION__?: string;
  __OPM_ACTIVE_PROFILE_BINDING__?: {
    profile_id: string;
    profile_version: string;
    rule_set_id: string;
    rule_version: string;
  };
}
