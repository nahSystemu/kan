import type { CreateNextContextOptions } from "@trpc/server/adapters/next";
import type { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import type { IncomingHttpHeaders } from "http";
import type { NextApiRequest } from "next";
import type { OpenApiMeta } from "trpc-to-openapi";
import { initTRPC, TRPCError } from "@trpc/server";
import { env } from "next-runtime-env";
import superjson from "superjson";
import { ZodError } from "zod";

import type { dbClient } from "@kan/db/client";
import { initAuth } from "@kan/auth/server";
import { createDrizzleClient } from "@kan/db/client";

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  image?: string | null | undefined;
  stripeCustomerId?: string | null | undefined;
}

const createAuthWithHeaders = (
  auth: ReturnType<typeof initAuth>,
  headers: Headers,
) => {
  return {
    api: {
      getSession: () => auth.api.getSession({ headers }),
      signInMagicLink: (input: { email: string; callbackURL: string }) =>
        auth.api.signInMagicLink({
          headers,
          body: { email: input.email, callbackURL: input.callbackURL },
        }),
      listActiveSubscriptions: (input: { workspacePublicId: string }) =>
        auth.api.listActiveSubscriptions({
          headers,
          query: { referenceId: input.workspacePublicId },
        }),
    },
  };
};

const toHeaders = (headers: IncomingHttpHeaders) => {
  const normalized = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (!value) {
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        continue;
      }

      normalized.set(key, value.join(", "));
      continue;
    }

    normalized.set(key, value);
  }

  return normalized;
};

const mergeConnectionParamsIntoHeaders = (
  headers: Headers,
  connectionParams: unknown,
) => {
  if (!connectionParams || typeof connectionParams !== "object") {
    return;
  }

  const entries = connectionParams as Record<string, unknown>;

  for (const [key, rawValue] of Object.entries(entries)) {
    if (typeof rawValue !== "string" || rawValue.length === 0) {
      continue;
    }

    const normalizedKey = key.toLowerCase();
    if (!headers.has(normalizedKey)) {
      // Allow non-browser clients to forward auth data (e.g. Authorization, Cookie).
      headers.set(normalizedKey, rawValue);
    }
  }
};

interface CreateContextOptions {
  user: User | null | undefined;
  db: dbClient;
  auth: ReturnType<typeof createAuthWithHeaders>;
  headers: Headers;
}

export const createInnerTRPCContext = (opts: CreateContextOptions) => {
  return {
    user: opts.user,
    db: opts.db,
    auth: opts.auth,
    headers: opts.headers,
  };
};

export const createTRPCContext = async ({ req }: CreateNextContextOptions) => {
  const db = createDrizzleClient();
  const baseAuth = initAuth(db);
  const headers = new Headers(req.headers as Record<string, string>);
  const auth = createAuthWithHeaders(baseAuth, headers);

  const session = await auth.api.getSession();

  return createInnerTRPCContext({ db, user: session?.user, auth, headers });
};

export const createNextApiContext = async (req: NextApiRequest) => {
  const db = createDrizzleClient();
  const baseAuth = initAuth(db);
  const headers = new Headers(req.headers as Record<string, string>);
  const auth = createAuthWithHeaders(baseAuth, headers);

  const session = await auth.api.getSession();

  return createInnerTRPCContext({ db, user: session?.user, auth, headers });
};

export const createRESTContext = async ({ req }: CreateNextContextOptions) => {
  const db = createDrizzleClient();
  const baseAuth = initAuth(db);
  const headers = new Headers(req.headers as Record<string, string>);
  const auth = createAuthWithHeaders(baseAuth, headers);

  let session;
  try {
    session = await auth.api.getSession();
  } catch (error) {
    console.error("Error getting session, ", error);
    throw error;
  }

  return createInnerTRPCContext({ db, user: session?.user, auth, headers });
};

export const createWSContext = async (opts: CreateWSSContextFnOptions) => {
  const db = createDrizzleClient();
  const baseAuth = initAuth(db);
  const headers = toHeaders(opts.req.headers);

  mergeConnectionParamsIntoHeaders(headers, opts.info.connectionParams);

  const auth = createAuthWithHeaders(baseAuth, headers);

  let session: Awaited<ReturnType<typeof auth.api.getSession>> | undefined;
  try {
    session = await auth.api.getSession();
  } catch (error) {
    console.error("Error getting session, ", error);
  }

  return createInnerTRPCContext({ db, user: session?.user, auth });
};

const t = initTRPC
  .context<typeof createTRPCContext>()
  .meta<OpenApiMeta>()
  .create({
    transformer: superjson,
    errorFormatter({ shape, error }) {
      return {
        ...shape,
        data: {
          ...shape.data,
          zodError:
            error.cause instanceof ZodError ? error.cause.flatten() : null,
        },
      };
    },
  });

export const createTRPCRouter = t.router;

export const createCallerFactory = t.createCallerFactory;

export const publicProcedure = t.procedure.meta({
  openapi: { method: "GET", path: "/public" },
});

const enforceUserIsAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx,
  });
});

const enforceUserIsAdmin = t.middleware(async ({ ctx, next }) => {
  if (ctx.headers.get("x-admin-api-key") !== env("KAN_ADMIN_API_KEY")) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx,
  });
});

export const protectedProcedure = t.procedure.use(enforceUserIsAuthed).meta({
  openapi: {
    method: "GET",
    path: "/protected",
  },
});

export const adminProtectedProcedure = t.procedure
  .use(enforceUserIsAdmin)
  .meta({
    openapi: {
      method: "GET",
      path: "/admin/protected",
    },
  });
