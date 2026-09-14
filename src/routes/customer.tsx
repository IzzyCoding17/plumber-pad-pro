import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCustomerDashboard, listPlumbers, sendCustomerMessage } from "@/lib/customer.functions";
import { currency } from "@/lib/flowline";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  CreditCard,
  Droplet,
  LogOut,
  MessageSquare,
  Search,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/customer")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/customer-auth" });
  },
  component: CustomerHome,
});

type View = "overview" | "schedule" | "payments" | "messages" | "profile";
type Job = {
  id: string;
  description: string;
  status: string;
  scheduled_at: string | null;
  final_price_cents: number | null;
  suggested_price_cents: number | null;
  business_name: string;
  plumber_verified: string;
};

function CustomerHome() {
  const [view, setView] = useState<View>("overview");
  const [message, setMessage] = useState("");
  const [messageJobId, setMessageJobId] = useState("");
  const client = useQueryClient();
  const dashboard = useQuery({
    queryKey: ["customer-dashboard"],
    queryFn: () => getCustomerDashboard(),
  });
  const plumbers = useQuery({
    queryKey: ["customer-plumbers"],
    queryFn: () => listPlumbers(),
    enabled: view === "overview",
  });
  const send = useMutation({
    mutationFn: () => sendCustomerMessage({ data: { jobId: messageJobId, body: message } }),
    onSuccess: () => {
      setMessage("");
      client.invalidateQueries({ queryKey: ["customer-dashboard"] });
      toast.success("Message sent");
    },
    onError: (error) => toast.error(error.message),
  });
  if (dashboard.isLoading) return <FullPage>Loading your portal...</FullPage>;
  if (dashboard.isError || !dashboard.data) {
    return (
      <FullPage>
        {dashboard.error instanceof Error ? dashboard.error.message : "Unable to load your portal."}
      </FullPage>
    );
  }
  const { profile, jobs, payments, messages } = dashboard.data;
  const scheduled = jobs.filter((job) => job.scheduled_at);
  const paidTotal = payments
    .filter((payment) => payment.status === "succeeded")
    .reduce((sum, payment) => sum + payment.amount_cents, 0);
  const nav: Array<{ id: View; label: string; icon: typeof Search }> = [
    { id: "overview", label: "Overview", icon: Search },
    { id: "schedule", label: "Schedule", icon: CalendarDays },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "messages", label: "Messages", icon: MessageSquare },
    { id: "profile", label: "Profile & trust", icon: UserRound },
  ];
  async function signOut() {
    await supabase.auth.signOut();
    window.location.assign("/customer-auth");
  }
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link to="/customer" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Droplet className="size-5" />
            </span>
            <span className="font-display text-xl font-bold">Flowline</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:block">
              {profile.full_name}
            </span>
            <Button variant="ghost" onClick={signOut}>
              <LogOut className="mr-2 size-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-56">
          <div className="flex gap-2 overflow-x-auto lg:flex-col">
            {nav.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`flex shrink-0 items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold ${view === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface-muted"}`}
              >
                <item.icon className="size-4" />
                {item.label}
              </button>
            ))}
          </div>
          <Link
            to="/find-a-plumber"
            className="mt-4 inline-flex w-full items-center gap-2 rounded-2xl border-2 border-border bg-surface px-4 py-3 text-sm font-bold"
          >
            <Search className="size-4" /> Browse plumbers
          </Link>
        </aside>
        <main className="min-w-0 flex-1">
          {view === "overview" && (
            <Overview
              jobs={jobs}
              plumbers={plumbers.data ?? []}
              scheduledCount={scheduled.length}
              paidTotal={paidTotal}
              profile={profile}
              onView={setView}
            />
          )}
          {view === "schedule" && (
            <Panel title="Schedule" subtitle="Appointments confirmed with your workers.">
              {scheduled.length ? (
                scheduled.map((job) => <JobRow key={job.id} job={job} />)
              ) : (
                <Empty>No appointments are scheduled yet.</Empty>
              )}
            </Panel>
          )}
          {view === "payments" && (
            <Panel title="Payments" subtitle="Track payment activity handled through Flowline.">
              <div className="rounded-2xl bg-surface-muted p-5">
                <p className="text-sm text-muted-foreground">Recorded total</p>
                <p className="mt-1 font-display text-3xl font-bold">{currency(paidTotal)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Payment verification will appear here when a secure payment method is connected.
                </p>
              </div>
              <div className="mt-5 space-y-3">
                {payments.length ? (
                  payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex justify-between rounded-2xl border border-border bg-surface p-4"
                    >
                      <div>
                        <p className="font-semibold">Job payment</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(payment.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <strong>{currency(payment.amount_cents)}</strong>
                    </div>
                  ))
                ) : (
                  <Empty>No payments yet.</Empty>
                )}
              </div>
            </Panel>
          )}
          {view === "messages" && (
            <Panel title="Messages" subtitle="Talk directly with the workers handling your jobs.">
              <div className="space-y-3">
                {messages.length ? (
                  messages.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-2xl border border-border p-4 ${item.direction === "inbound" ? "ml-8 bg-primary/5" : "mr-8 bg-surface"}`}
                    >
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{item.business_name}</span>
                        <span>{new Date(item.created_at).toLocaleString()}</span>
                      </div>
                      <p className="mt-2 text-sm">{item.body}</p>
                    </div>
                  ))
                ) : (
                  <Empty>Your conversations will appear here after you send a request.</Empty>
                )}
              </div>
              <div className="mt-6 rounded-2xl border-2 border-border bg-surface p-4">
                <label className="text-sm font-semibold">Send a message</label>
                <select
                  value={messageJobId}
                  onChange={(event) => setMessageJobId(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Choose a request</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.business_name} - {job.description.slice(0, 45)}
                    </option>
                  ))}
                </select>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Write to your plumber..."
                  className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                />
                <Button
                  disabled={!messageJobId || !message.trim() || send.isPending}
                  onClick={() => send.mutate()}
                  className="mt-2"
                >
                  <Send className="mr-2 size-4" /> Send message
                </Button>
              </div>
            </Panel>
          )}
          {view === "profile" && (
            <Panel
              title="Profile & trust"
              subtitle="Your trust status is attached to requests workers receive."
            >
              <div className="flex items-center gap-4 rounded-2xl bg-surface-muted p-5">
                <div className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
                  <UserRound className="size-6" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold">{profile.full_name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {profile.phone || "No phone added"}
                  </p>
                </div>
              </div>
              <div className="mt-5 rounded-2xl border-2 border-border bg-surface p-5">
                <div className="flex items-center gap-3">
                  <ShieldCheck
                    className={
                      profile.verification_status === "verified"
                        ? "text-success"
                        : "text-muted-foreground"
                    }
                  />
                  <div>
                    <p className="font-bold">
                      {profile.verification_status === "verified"
                        ? "Verified client"
                        : "Client verification pending"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Workers can see this trust status before accepting a request.
                    </p>
                  </div>
                </div>
                <Button disabled className="mt-5 rounded-xl">
                  Secure verification payment coming soon
                </Button>
              </div>
            </Panel>
          )}
        </main>
      </div>
    </div>
  );
}

function Overview({
  jobs,
  plumbers,
  scheduledCount,
  paidTotal,
  profile,
  onView,
}: {
  jobs: Job[];
  plumbers: Array<{ id: string; business_name: string }>;
  scheduledCount: number;
  paidTotal: number;
  profile: { full_name: string; verification_status: string };
  onView: (view: View) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Client portal</p>
          <h1 className="mt-2 font-display text-4xl font-bold">
            Good to see you, {profile.full_name.split(" ")[0]}.
          </h1>
          <p className="mt-2 text-muted-foreground">
            Keep requests, appointments, payments, and conversations together.
          </p>
        </div>
        <Link
          to="/find-a-plumber"
          className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
        >
          <Search className="size-4" /> Find a plumber
        </Link>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat
          icon={ShieldCheck}
          label="Your trust status"
          value={profile.verification_status === "verified" ? "Verified" : "Not verified"}
        />
        <Stat icon={CalendarDays} label="Upcoming visits" value={String(scheduledCount)} />
        <Stat icon={CreditCard} label="Payments on file" value={currency(paidTotal)} />
      </div>
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">Recent requests</h2>
          <button onClick={() => onView("schedule")} className="text-sm font-bold text-primary">
            View schedule
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {jobs.length ? (
            jobs.slice(0, 4).map((job) => <JobRow key={job.id} job={job} />)
          ) : (
            <Empty>No requests yet. Browse plumbers to get started.</Empty>
          )}
        </div>
      </section>
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">Available plumbers</h2>
          <Link to="/find-a-plumber" className="text-sm font-bold text-primary">
            See all
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {plumbers.slice(0, 4).map((plumber) => (
            <div key={plumber.id} className="rounded-2xl border-2 border-border bg-surface p-4">
              <strong>{plumber.business_name}</strong>
              <Link
                to="/customer/request/$plumberId"
                params={{ plumberId: plumber.id }}
                className="mt-3 block text-sm font-bold text-primary"
              >
                Request service
              </Link>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
function Stat({ icon: Icon, label, value }: { icon: typeof Search; label: string; value: string }) {
  return (
    <div className="rounded-2xl border-2 border-border bg-surface p-5">
      <Icon className="size-5 text-primary" />
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
    </div>
  );
}
function JobRow({ job }: { job: Job }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-border bg-surface p-5">
      <div>
        <div className="flex items-center gap-2 font-bold">
          {job.business_name}
          {job.plumber_verified === "verified" && <ShieldCheck className="size-4 text-success" />}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{job.description}</p>
        {job.scheduled_at && (
          <p className="mt-2 text-xs font-semibold text-primary">
            <CalendarDays className="mr-1 inline size-3" />
            {new Date(job.scheduled_at).toLocaleString()}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-bold capitalize">
          {job.status}
        </span>
        <strong>{currency(job.final_price_cents ?? job.suggested_price_cents)}</strong>
      </div>
    </div>
  );
}
function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h1 className="font-display text-4xl font-bold">{title}</h1>
      <p className="mt-2 text-muted-foreground">{subtitle}</p>
      <div className="mt-8">{children}</div>
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
function FullPage({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
      {children}
    </div>
  );
}
