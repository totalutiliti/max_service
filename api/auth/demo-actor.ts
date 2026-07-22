export const demoActorIds = {
  customer: "00000000-0000-4000-8000-000000000101",
  provider: "00000000-0000-4000-8000-000000000201",
  partner: "00000000-0000-4000-8000-000000000301",
  operation: "00000000-0000-4000-8000-000000000401",
} as const;

export type ActorRole = keyof typeof demoActorIds;

export interface Actor {
  id: string;
  role: ActorRole;
}

export function parseDemoActor(
  roleHeader: string | undefined,
  actorIdHeader: string | undefined,
  demoMode = process.env.DEMO_MODE === "true",
): Actor {
  if (!demoMode) {
    throw new Error("O acesso demonstrativo está desativado.");
  }

  if (!roleHeader || !(roleHeader in demoActorIds)) {
    throw new Error("Perfil demonstrativo inválido.");
  }

  const role = roleHeader as ActorRole;
  const expectedId = demoActorIds[role];
  if (actorIdHeader !== expectedId) {
    throw new Error("Identidade demonstrativa inválida.");
  }

  return { id: expectedId, role };
}
