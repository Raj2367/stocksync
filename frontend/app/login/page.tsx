"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function attemptLogin(attemptEmail: string, attemptPassword: string) {
    setError(null);
    setIsLoading(true);

    try {
      await login(attemptEmail, attemptPassword);
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiError && typeof err.body === "object" && err.body !== null && "error" in err.body && typeof (err.body as { error: unknown }).error === "string") {
        setError((err.body as { error: string }).error);
      } else {
        setError("Invalid email or password. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim() || !password) {
      setError("Please enter both your email and password.");
      return;
    }

    await attemptLogin(email, password);
  }

  return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-6 rounded-lg bg-white p-8 shadow-md"
      >
        <h1 className="text-center text-2xl font-bold">StockSync</h1>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {error && (
          <div role="alert" className="text-sm text-red-600">
            {error}
          </div>
        )}

        <Button type="submit" disabled={isLoading} className="w-full">
          {isLoading ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md">
        <h2 className="text-center text-lg font-semibold">Demo environment</h2>
        <p className="text-center text-sm text-gray-600">
          No registration is required. Explore the application with a seeded
          tenant.
        </p>
        <div className="mt-4 space-y-3">
          <Button
            variant="outline"
            disabled={isLoading}
            className="w-full"
            onClick={() =>
              attemptLogin(
                "user@acme.stocksync",
                "RuXRlN8NEAl6yO5hNVMOE1T1PNc79gA6",
              )
            }
          >
            Tenant Acme
          </Button>
          <Button
            variant="outline"
            disabled={isLoading}
            className="w-full"
            onClick={() =>
              attemptLogin(
                "user@beta.stocksync",
                "D2O3X4wHxLmhNiFeqF3ciYXRkA+k2xMl",
              )
            }
          >
            Tenant Beta
          </Button>
        </div>
      </div>
    </main>
  );
}
