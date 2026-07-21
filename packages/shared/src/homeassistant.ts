/** Internal settings including plaintext token — never send over wire. */
export interface HaSettings {
  url: string | null;
  token: string | null;
  enabled: boolean;
}

/** Public DTO for HaSettings — token is always null, tokenSet indicates whether one is stored. */
export interface HaSettingsPublic {
  url: string | null;
  token: null;
  tokenSet: boolean;
  enabled: boolean;
}

export interface HaEntity {
  entityId: string;
  name: string;
  state: string;
  unit: string | null;
  icon: string | null;
  domain: string;
  attributes: Record<string, unknown>;
}

/** Lightweight entry used in the entity browser (browse all HA states). */
export interface HaEntityBrowse {
  entityId: string;
  name: string;
  state: string;
  unit: string | null;
  domain: string;
}

export interface HaState {
  settings: HaSettingsPublic;
  entities: HaEntity[];
  connectedAt: string | null;
  error: string | null;
  wsConnected: boolean;
}
