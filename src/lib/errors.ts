/** Erreur métier dont le message peut être montré tel quel à l'utilisateur. */
export class ServiceError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function publicMessage(e: unknown) {
  if (e instanceof ServiceError) return e.message;
  console.error(e);
  return "Une erreur est survenue. Réessayez dans un instant.";
}
