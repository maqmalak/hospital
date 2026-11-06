import { getCall } from "@/services/frappe";
import { printDoc, mappedPrinter } from "@/lib/print";
import { patientCardHtml, type CardData } from "@/lib/templates";
import type { Boot } from "@/lib/auth";

export async function printCard(mr: string, boot: Boot) {
  const c = await getCall<CardData>("hospital_vvs.api.patients.card", { name: mr });
  await printDoc(patientCardHtml(c, boot.clinic, boot.print.card), "label", { agent: !!boot.print.agent, printer: mappedPrinter(boot.print.printers, "label") });
}

export const ALLERGIES_DOCTYPE = "Allergy";
