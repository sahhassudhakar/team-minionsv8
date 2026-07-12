"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Diamond, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const result = await login(email, password);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const next = searchParams.get("next") || "/";
    router.push(next);
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Diamond className="size-5 fill-accent-primary text-accent-primary" />
          <span className="text-lg font-semibold text-text-primary">Team Minions</span>
        </div>

        <div className="rounded-xl border border-border-subtle bg-bg-surface p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-text-primary">Sign in</h1>
          <p className="mt-1 text-sm text-text-secondary">Water Stewardship — PWI Evidence Platform</p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <div>
              <label className="text-xs font-medium text-text-secondary">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@teamminions.ai"
                className="mt-1 w-full rounded-md border border-border-strong px-3 py-2 text-sm focus:border-accent-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full rounded-md border border-border-strong px-3 py-2 text-sm focus:border-accent-primary focus:outline-none"
              />
            </div>

            {error && <p className="text-sm text-status-insufficient">{error}</p>}

            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Sign in
            </Button>
          </form>

          <div className="mt-5 border-t border-border-subtle pt-4">
            <div className="flex items-start gap-2 rounded-md bg-bg-surface-sunken px-3 py-2.5 text-xs text-text-secondary">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent-primary" />
              <span>
                First run only: a bootstrap Admin account exists at{" "}
                <span className="font-mono text-text-primary">admin@teamminions.ai</span> /{" "}
                <span className="font-mono text-text-primary">ChangeMe123!</span> — sign in and create
                real Auditor and Floor Manager accounts (with a site assignment) under Admin → Users.
                Change this password immediately in a real deployment.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
