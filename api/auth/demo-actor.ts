export const demoActorIds = {
  customer: "00000000-0000-4000-8000-000000000101",
  provider: "00000000-0000-4000-8000-000000000201",
  partner: "00000000-0000-4000-8000-000000000301",
  operation: "00000000-0000-4000-8000-000000000401",
  advertiser: "00000000-0000-4000-8000-000000000501",
} as const;

export type ActorRole = keyof typeof demoActorIds;

export interface Actor {
  id: string;
  role: ActorRole;
}

const actorIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const demoIds = new Set<string>(Object.values(demoActorIds));

export function parseDemoActor(
  roleHeader: string | undefined,
  actorIdHeader: string | undefined,
  demoMode = process.env.DEMO_MODE === "true",
): Actor {
  if (!roleHeader || !(roleHeader in demoActorIds)) {
    throw new Error("Perfil de identidade inválido.");
  }

  const role = roleHeader as ActorRole;
  if (demoMode) {
    const expectedId = demoActorIds[role];
    if (actorIdHeader !== expectedId) {
      throw new Error("Identidade demonstrativa inválida.");
    }
    return { id: expectedId, role };
  }

  if (process.env.PRODUCTION_IDENTITY_ENABLED !== "true") {
    throw new Error("O acesso de produção está desativado.");
  }
  if (!actorIdHeader || !actorIdPattern.test(actorIdHeader) || demoIds.has(actorIdHeader)) {
    throw new Error("Identidade de produção inválida.");
  }

  return { id: actorIdHeader, role };
}
