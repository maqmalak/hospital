import { getCall } from "@/lib/api";
import { printDoc } from "@/lib/print";
import { prescriptionHtml, type RxPrint } from "@/lib/templates";

/** Print or reprint a signed prescription anywhere (workspace, previous list, history, queue). */
export async function printPrescription(name: string, mr: string, boot?: { print?: { prescription?: string; agent?: boolean | number } } | null) {
  const d = await getCall<Omit<RxPrint, "mr">>("hospital_vvs.api.prescription.print_data", { name });
  await printDoc(prescriptionHtml({ ...d, mr }, boot?.print?.prescription === "A5" ? "A5" : "A4"), "a4", { agent: !!boot?.print?.agent });
}
