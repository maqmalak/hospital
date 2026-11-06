import { Construction } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function ComingPage({ title, phase }: { title: string; phase: number }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto mt-16 max-w-md rounded-3xl border border-dashed border-border p-10 text-center">
      <Construction className="mx-auto mb-3 h-10 w-10 text-amber-500" />
      <h2 className="text-lg font-bold">{t(title)}</h2>
      <p className="text-sm text-muted-foreground">Arrives in Phase {phase} of the build plan.</p>
    </div>
  );
}
