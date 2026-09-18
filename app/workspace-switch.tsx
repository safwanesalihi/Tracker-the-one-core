"use client";
import { useI18n } from "@/app/locale-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { roleLabels, type WorkspaceSummary } from "@/lib/workspace";

export default function WorkspaceSwitch({
  value,
  workspaces,
  disabled,
  onChange,
}: {
  value: string;
  workspaces: WorkspaceSummary[];
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  const { t, dir } = useI18n();
  return (
    <div className="workspace-switch">
      <span>{t("Espace")}</span>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        dir={dir}
      >
        <SelectTrigger
          className="workspace-switch-trigger"
          aria-label={t("Espace")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {workspaces.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.name} · {t(roleLabels[w.role])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
