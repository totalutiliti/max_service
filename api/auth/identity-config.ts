export const identityProviderModes = [
  "disabled",
  "local_credentials",
  "external_oidc",
] as const;

export type IdentityProviderMode = typeof identityProviderModes[number];

export interface IdentityRuntimeConfiguration {
  demoMode: boolean;
  productionFeatureEnabled: boolean;
  providerMode: IdentityProviderMode;
  ready: boolean;
  blockedReason: string | null;
}

export class IdentityConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityConfigurationError";
  }
}

export function identityRuntimeConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): IdentityRuntimeConfiguration {
  const demoMode = environment.DEMO_MODE === "true";
  const productionFeatureEnabled = environment.PRODUCTION_IDENTITY_ENABLED === "true";
  const rawProviderMode = environment.IDENTITY_PROVIDER_MODE ?? "disabled";
  const providerMode = identityProviderModes.includes(rawProviderMode as IdentityProviderMode)
    ? rawProviderMode as IdentityProviderMode
    : "disabled";

  if (demoMode) {
    return {
      demoMode,
      productionFeatureEnabled,
      providerMode,
      ready: false,
      blockedReason: "O modo demonstrativo está ativo.",
    };
  }
  if (!productionFeatureEnabled) {
    return {
      demoMode,
      productionFeatureEnabled,
      providerMode,
      ready: false,
      blockedReason: "A feature de identidade de produção está desativada.",
    };
  }
  if (rawProviderMode !== providerMode) {
    return {
      demoMode,
      productionFeatureEnabled,
      providerMode,
      ready: false,
      blockedReason: "O modo do provedor de identidade é inválido.",
    };
  }
  if (providerMode === "disabled") {
    return {
      demoMode,
      productionFeatureEnabled,
      providerMode,
      ready: false,
      blockedReason: "Nenhum provedor de identidade foi selecionado e homologado.",
    };
  }
  return {
    demoMode,
    productionFeatureEnabled,
    providerMode,
    ready: true,
    blockedReason: null,
  };
}

export function requireProductionIdentity(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const configuration = identityRuntimeConfiguration(environment);
  if (!configuration.ready) {
    throw new IdentityConfigurationError(
      configuration.blockedReason ?? "Identidade de produção indisponível.",
    );
  }
  return configuration;
}
