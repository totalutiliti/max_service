import type { ActorRole } from "./demo-actor.js";
import {
  requireProductionIdentity,
  type IdentityProviderMode,
} from "./identity-config.js";

export interface IdentityAuthenticationInput {
  identifier: string;
  secret?: string;
  authorizationCode?: string;
  redirectUri?: string;
}

export interface VerifiedIdentityPrincipal {
  userId: string;
  role: ActorRole;
  providerKey: string;
  providerSubjectDigest: string;
  contactVerified: boolean;
  mfaCompletedAt: Date | null;
}

export interface IdentityProviderAdapter {
  readonly mode: Exclude<IdentityProviderMode, "disabled">;
  readonly providerKey: string;
  authenticate(input: IdentityAuthenticationInput): Promise<VerifiedIdentityPrincipal>;
}

export class IdentityProviderUnavailableError extends Error {
  constructor(message = "O provedor de identidade não está disponível.") {
    super(message);
    this.name = "IdentityProviderUnavailableError";
  }
}

export class IdentityProviderRegistry {
  private readonly adapters = new Map<IdentityProviderMode, IdentityProviderAdapter>();

  constructor(adapters: IdentityProviderAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: IdentityProviderAdapter) {
    if (this.adapters.has(adapter.mode)) {
      throw new IdentityProviderUnavailableError(
        `Mais de um adapter foi registrado para ${adapter.mode}.`,
      );
    }
    this.adapters.set(adapter.mode, adapter);
  }

  selected(environment: NodeJS.ProcessEnv = process.env) {
    const configuration = requireProductionIdentity(environment);
    const adapter = this.adapters.get(configuration.providerMode);
    if (!adapter) {
      throw new IdentityProviderUnavailableError(
        "A feature foi habilitada, mas o adapter selecionado não foi registrado.",
      );
    }
    return adapter;
  }
}
