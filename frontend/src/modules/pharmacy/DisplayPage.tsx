import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { CustomerFacing } from "@/modules/display/CustomerFacing";
import { usePharmacyDisplay } from "./display-channel";

/** Customer screen for the pharmacy counter: open it on the second monitor of the same PC (POS top bar → Display). */
export default function PharmacyDisplayPage() {
  const s = usePharmacyDisplay();
  const { boot } = useAuth();
  useEffect(() => { document.title = "Pharmacy · customer display"; }, []);
  return <CustomerFacing state={s} clinic={boot?.clinic.name ?? "Pharmacy"} clinicUr={boot?.clinic.name_ur} place="Pharmacy" />;
}
