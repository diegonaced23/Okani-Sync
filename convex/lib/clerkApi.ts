/**
 * Helpers para llamar a la Clerk REST API desde acciones de Convex.
 * Se usa fetch directo porque las actions de Convex son Node.js puro,
 * sin contexto de Next.js, por lo que @clerk/nextjs no aplica.
 */

const CLERK_API = "https://api.clerk.com/v1";

function authHeaders(secretKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
  };
}

export interface ClerkUserCreated {
  id: string;
  email_addresses: Array<{ email_address: string }>;
  first_name: string | null;
  last_name: string | null;
}

/** Crea un usuario en Clerk. Devuelve el objeto de usuario creado. */
export async function clerkCreateUser(args: {
  email: string;
  firstName: string;
  lastName?: string;
  secretKey: string;
}): Promise<ClerkUserCreated> {
  const res = await fetch(`${CLERK_API}/users`, {
    method: "POST",
    headers: authHeaders(args.secretKey),
    body: JSON.stringify({
      email_address: [args.email],
      first_name: args.firstName,
      last_name: args.lastName ?? "",
      skip_password_requirement: true,
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      errors?: Array<{ message: string }>;
    };
    throw new Error(
      err.errors?.[0]?.message ?? `Clerk API error ${res.status}`
    );
  }
  return res.json() as Promise<ClerkUserCreated>;
}

/** Elimina un usuario en Clerk. */
export async function clerkDeleteUser(args: {
  clerkId: string;
  secretKey: string;
}): Promise<void> {
  const res = await fetch(`${CLERK_API}/users/${args.clerkId}`, {
    method: "DELETE",
    headers: authHeaders(args.secretKey),
  });

  // 404 = ya fue eliminado, lo aceptamos
  if (!res.ok && res.status !== 404) {
    const err = (await res.json().catch(() => ({}))) as {
      errors?: Array<{ message: string }>;
    };
    throw new Error(
      err.errors?.[0]?.message ?? `Clerk delete error ${res.status}`
    );
  }
}
