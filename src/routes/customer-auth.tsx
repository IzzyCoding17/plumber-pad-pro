import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Droplet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/customer-auth")({ component: CustomerAuth });

function CustomerAuth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const result =
        mode === "signup"
          ? await supabase.auth.signUp({
              email,
              password,
              options: {
                emailRedirectTo: `${window.location.origin}/customer`,
                data: { account_type: "customer", full_name: name },
              },
            })
          : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        toast.success("Account created. Check your email to verify it, then sign in.");
        setMode("signin");
      } else {
        const { data: customerProfile } = await (supabase as any)
          .from("customer_profiles")
          .select("id")
          .eq("id", result.data.user?.id ?? "")
          .maybeSingle();
        if (!customerProfile) {
          await supabase.auth.signOut();
          throw new Error("This is a worker account. Use Worker sign in instead.");
        }
        navigate({ to: "/customer" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-6 py-12 text-foreground">
      <div className="mx-auto max-w-md">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Droplet className="size-5" />
          </span>
          <span className="font-display text-xl font-bold">Flowline</span>
        </Link>
        <div className="mt-12 rounded-3xl border-2 border-border bg-surface p-8 shadow-card">
          <h1 className="font-display text-3xl font-bold">
            {mode === "signup" ? "Find a trusted plumber" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a client account to send requests and track your jobs.
          </p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <div>
                <Label htmlFor="name">Full name</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                minLength={6}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button disabled={loading} className="w-full rounded-2xl">
              {loading ? "Working..." : mode === "signup" ? "Create client account" : "Sign in"}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            className="mt-6 w-full text-sm font-semibold text-primary"
          >
            {mode === "signup" ? "Already have an account? Sign in" : "Create a client account"}
          </button>
        </div>
      </div>
    </div>
  );
}
