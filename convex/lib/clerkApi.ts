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
  password?: string;
  secretKey: string;
}): Promise<ClerkUserCreated> {
  const body: Record<string, unknown> = {
    email_address: [args.email],
    first_name: args.firstName,
    last_name: args.lastName ?? "",
  };
  if (args.password) {
    body.password = args.password;
  } else {
    body.skip_password_requirement = true;
  }

  const res = await fetch(`${CLERK_API}/users`, {
    method: "POST",
    headers: authHeaders(args.secretKey),
    body: JSON.stringify(body),
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

export interface ClerkInvitation {
  id: string;
  email_address: string;
  status: string;
}

/** Crea una invitación en Clerk. Clerk envía el email automáticamente. */
export async function clerkCreateInvitation(args: {
  email: string;
  role?: "user" | "admin";
  secretKey: string;
}): Promise<ClerkInvitation> {
  const body: Record<string, unknown> = {
    email_address: args.email,
  };
  if (args.role) {
    body.public_metadata = { role: args.role };
  }

  const res = await fetch(`${CLERK_API}/invitations`, {
    method: "POST",
    headers: authHeaders(args.secretKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      errors?: Array<{ message: string }>;
    };
    throw new Error(
      err.errors?.[0]?.message ?? `Clerk API error ${res.status}`
    );
  }
  return res.json() as Promise<ClerkInvitation>;
}

/** Busca un usuario en Clerk por email. Devuelve null si no existe. */
export async function clerkFindUserByEmail(args: {
  email: string;
  secretKey: string;
}): Promise<ClerkUserCreated | null> {
  const params = new URLSearchParams({ email_address: args.email });
  const res = await fetch(`${CLERK_API}/users?${params.toString()}`, {
    headers: authHeaders(args.secretKey),
  });
  if (!res.ok) return null;
  const list = (await res.json()) as ClerkUserCreated[];
  return list[0] ?? null;
}

/** Crea un sign-in token (link mágico de un solo uso) para el usuario. */
export async function clerkCreateSignInToken(args: {
  clerkId: string;
  secretKey: string;
}): Promise<string> {
  const res = await fetch(`${CLERK_API}/sign_in_tokens`, {
    method: "POST",
    headers: authHeaders(args.secretKey),
    body: JSON.stringify({ user_id: args.clerkId }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      errors?: Array<{ message: string }>;
    };
    throw new Error(
      err.errors?.[0]?.message ?? `Clerk sign_in_tokens error ${res.status}`
    );
  }

  const data = (await res.json()) as { url: string };
  return data.url;
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
