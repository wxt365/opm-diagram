/// <reference types="vite/client" />

interface Window {
  __OPM_LOCAL_SESSION__?: string;
  __OPM_ACTIVE_PROFILE_BINDING__?: {
    profile_id: string;
    profile_version: string;
    rule_set_id: string;
    rule_version: string;
  };
}
