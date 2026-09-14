import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { submitCustomerRequest } from "@/lib/customer.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Droplet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/customer/request/$plumberId")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/customer-auth" });
  },
  component: CustomerRequest,
});

function CustomerRequest() {
  const { plumberId } = Route.useParams();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    description: "",
    urgency: "week" as "today" | "week" | "whenever",
  });
  const request = useMutation({
    mutationFn: () => submitCustomerRequest({ data: { plumberId, ...form } }),
    onSuccess: () => toast.success("Request sent to the plumber"),
    onError: (error) => toast.error(error.message),
  });
  return (
    <div className="min-h-screen bg-background px-6 py-12 text-foreground">
      <div className="mx-auto max-w-lg">
        <Link
          to="/customer"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground"
        >
          <ArrowLeft className="size-4" /> Client portal
        </Link>
        <div className="mt-8 flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Droplet className="size-5" />
          </span>
          <span className="font-display text-xl font-bold">Send a job request</span>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            request.mutate();
          }}
          className="mt-8 space-y-5 rounded-3xl border-2 border-border bg-surface p-6"
        >
          <div>
            <Label htmlFor="request-name">Your name</Label>
            <Input
              id="request-name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="request-phone">Phone</Label>
            <Input
              id="request-phone"
              required
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="request-address">Service address</Label>
            <Input
              id="request-address"
              required
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="request-description">What needs fixing?</Label>
            <textarea
              id="request-description"
              required
              minLength={5}
              maxLength={1000}
              rows={5}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <Label>Urgency</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["today", "week", "whenever"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setForm({ ...form, urgency: value })}
                  className={`rounded-xl border-2 px-3 py-3 text-xs font-bold uppercase ${form.urgency === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  {value === "week" ? "This week" : value}
                </button>
              ))}
            </div>
          </div>
          <Button disabled={request.isPending} className="w-full rounded-2xl">
            {request.isPending ? "Sending..." : "Send request"}
          </Button>
        </form>
      </div>
    </div>
  );
}
