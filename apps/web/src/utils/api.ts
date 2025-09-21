import type { TRPCLink } from "@trpc/client";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { QueryClient } from "@tanstack/react-query";
import {
  httpBatchLink,
  httpSubscriptionLink,
  loggerLink,
  splitLink,
} from "@trpc/client";
import { createTRPCNext } from "@trpc/next";
import { observable } from "@trpc/server/observable";
import superjson from "superjson";

import type { AppRouter } from "@kan/api/root";

import { env as validatedEnv } from "~/env";

/**
 * This is the client-side entrypoint for your tRPC API. It is used to create the `api` object which
 * contains the Next.js App-wrapper, as well as your type-safe React Query hooks.
 *
 * We also create a few inference helpers for input and output types.
 */

const authLink: TRPCLink<AppRouter> = () => {
  return ({ next, op }) => {
    return observable((observer) => {
      const unsubscribe = next(op).subscribe({
        next(value) {
          observer.next(value);
        },
        error(err) {
          if (typeof window !== "undefined" && err.message === "UNAUTHORIZED") {
            window.location.href = "/login";
          }
          observer.error(err);
        },
        complete() {
          observer.complete();
        },
      });
      return unsubscribe;
    });
  };
};

const getBaseUrl = () => {
  if (typeof window !== "undefined") return ""; // browser should use relative url
  if (validatedEnv.NEXT_PUBLIC_BASE_URL)
    return validatedEnv.NEXT_PUBLIC_BASE_URL; // prefer configured base
  return `http://localhost:3000`; // fallback for dev SSR
};

const queryClient = new QueryClient();

export const api = createTRPCNext<AppRouter>({
  config() {
    return {
      links: [
        loggerLink({
          enabled: (opts) =>
            validatedEnv.NODE_ENV === "development" ||
            (opts.direction === "down" && opts.result instanceof Error),
        }),
        authLink,
        splitLink({
          condition(op) {
            return op.type === "subscription";
          },
          true: httpSubscriptionLink({
            url: `${getBaseUrl()}/api/trpc`,
            transformer: superjson,
            // Important: include cookies so protected subscriptions authenticate
            eventSourceOptions: {
              withCredentials: true,
            },
          }),
          false: httpBatchLink({
            url: `${getBaseUrl()}/api/trpc`,
            transformer: superjson,
          }),
        }),
      ],
      queryClient: queryClient,
    };
  },
  transformer: superjson,
  ssr: false,
});

/**
 * Inference helper for inputs.
 *
 * @example type HelloInput = RouterInputs['example']['hello']
 */
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Inference helper for outputs.
 *
 * @example type HelloOutput = RouterOutputs['example']['hello']
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
