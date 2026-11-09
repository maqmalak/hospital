import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { CustomerFacing, type CfState } from "@/modules/display/CustomerFacing";
import { useDisplayState } from "./offline";

/** Customer-facing screen for the reception counter (second monitor on the same PC, Restaurant OS style). */
export default function CounterDisplayPage() {
  const s = useDisplayState();
  const { boot } = useAuth();
  useEffect(() => { document.title = "Reception · customer display"; }, []);
  const state: CfState = s.kind === "cart" ? { kind: "cart", customer: s.patient, lines: s.lines.map((l) => ({ name: l.label, amount: l.amount })), subtotal: s.total, total: s.total }
    : s.kind === "pay" ? { kind: "pay", customer: s.patient, total: s.total, paid: s.paid, change: s.change }
    : s.kind === "done" ? { kind: "done", customer: s.patient, total: s.total, change: s.change, at: s.at ?? Date.now(),
      tokens: s.tokens.map((t) => ({ label: t.doctor, token: t.token, sub: t.room ? `Room ${t.room}` : undefined })), note: "Please wait for your token to be called" }
    : { kind: "idle" };
  return <CustomerFacing state={state} clinic={boot?.clinic.name ?? "VVS Hospital"} clinicUr={boot?.clinic.name_ur} place="Reception" idleIcon="heart" />;
}
