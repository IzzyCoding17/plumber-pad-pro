import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listPlumbers } from "@/lib/customer.functions";
import { Droplet, MapPin, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/find-a-plumber")({ component: FindAPlumber });

function FindAPlumber() {
  const { data: plumbers = [], isLoading } = useQuery({
    queryKey: ["marketplace-plumbers"],
    queryFn: () => listPlumbers(),
  });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Droplet className="size-5" />
            </span>
            <span className="font-display text-xl font-bold">Flowline</span>
          </Link>
          <Link to="/customer" className="text-sm font-semibold text-primary">
            Back to client portal
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Local pros, one clear request
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold">Find a plumber for the job.</h1>
          <p className="mt-3 text-muted-foreground">
            Choose a worker, describe what you need, and keep the conversation in one place.
          </p>
        </div>
        {isLoading ? (
          <p className="mt-12 text-muted-foreground">Loading plumbers...</p>
        ) : (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plumbers.map((plumber: { id: string; business_name: string; slug: string }) => (
              <div key={plumber.id} className="rounded-3xl border-2 border-border bg-surface p-6">
                <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Droplet className="size-5" />
                </div>
                <h2 className="mt-5 font-display text-xl font-bold">{plumber.business_name}</h2>
                <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="size-4" /> Independent local professional
                </p>
                <Link
                  to="/customer/request/$plumberId"
                  params={{ plumberId: plumber.id }}
                  className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary"
                >
                  Request service <ArrowRight className="size-4" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
