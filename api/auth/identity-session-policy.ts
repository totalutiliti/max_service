export interface IdentitySessionPolicy {
  absoluteMinutes: number;
  idleMinutes: number;
  rotationMinutes: number;
}

export function identitySessionPolicy(
  environment: NodeJS.ProcessEnv = process.env,
): IdentitySessionPolicy {
  const absoluteMinutes = integer(environment.IDENTITY_SESSION_ABSOLUTE_MINUTES);
  const idleMinutes = integer(environment.IDENTITY_SESSION_IDLE_MINUTES);
  const rotationMinutes = integer(environment.IDENTITY_SESSION_ROTATION_MINUTES);

  if (absoluteMinutes < 30 || absoluteMinutes > 1_440) {
    throw new Error("IDENTITY_SESSION_ABSOLUTE_MINUTES deve ficar entre 30 e 1440.");
  }
  if (idleMinutes < 5 || idleMinutes > absoluteMinutes) {
    throw new Error("IDENTITY_SESSION_IDLE_MINUTES deve ficar entre 5 e a validade absoluta.");
  }
  if (rotationMinutes < 5 || rotationMinutes > idleMinutes) {
    throw new Error("IDENTITY_SESSION_ROTATION_MINUTES deve ficar entre 5 e a validade ociosa.");
  }
  return { absoluteMinutes, idleMinutes, rotationMinutes };
}

function integer(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return 0;
  return Number(value);
}
