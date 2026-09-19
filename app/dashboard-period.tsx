"use client";
import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useI18n } from "@/app/locale-provider";
import { monthPeriod, shiftDay } from "@/lib/flow";

export function dashboardPeriod(
  today: string,
  key: string,
  customMonth?: string,
) {
  if (key === "all") return null;
  if (key === "30") return { from: shiftDay(today, -29), to: today };
  if (key === "previous")
    return monthPeriod(shiftDay(today.slice(0, 8) + "01", -1));
  return monthPeriod(
    key === "custom" && customMonth ? customMonth + "-01" : today,
  );
}

export default function DashboardPeriod({
  value,
  onChange,
  customMonth,
  onMonthChange,
}: {
  value: string;
  onChange: (value: string) => void;
  customMonth?: string;
  onMonthChange?: (month: string) => void;
}) {
  const { t, tag, dir, rtl } = useI18n();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(
    Number(customMonth?.slice(0, 4)) || new Date().getFullYear(),
  );
  return (
    <div className="dashboard-period-controls">
      <Select value={value} onValueChange={onChange} dir={dir}>
        <SelectTrigger className="pick" aria-label={t("Période")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="month">{t("Ce mois")}</SelectItem>
          <SelectItem value="previous">{t("Mois précédent")}</SelectItem>
          <SelectItem value="30">{t("30 jours")}</SelectItem>
          {onMonthChange && (
            <SelectItem value="all">{t("Tout l’historique")}</SelectItem>
          )}
        </SelectContent>
      </Select>
      {onMonthChange && (
        <Popover
          open={open}
          onOpenChange={(next) => {
            if (next)
              setYear(
                Number(customMonth?.slice(0, 4)) || new Date().getFullYear(),
              );
            setOpen(next);
          }}
        >
          <PopoverTrigger asChild>
            <button
              className={`date-picker-trigger ${value === "custom" ? "has-value" : ""}`}
              type="button"
              aria-label={t("Choisir un mois")}
            >
              <CalendarDays size={15} />
              <span>
                {value === "custom" && customMonth
                  ? new Date(customMonth + "-01T12:00:00").toLocaleDateString(
                      tag,
                      { month: "long", year: "numeric" },
                    )
                  : t("Choisir un mois")}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="date-picker-popover"
            align="start"
            sideOffset={8}
            dir={dir}
          >
            <header className="date-picker-header">
              <button
                type="button"
                className="date-picker-nav"
                aria-label={t("Année précédente")}
                disabled={year <= 1900}
                onClick={() => setYear(year - 1)}
              >
                {rtl ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
              <strong>{year}</strong>
              <button
                type="button"
                className="date-picker-nav"
                aria-label={t("Année suivante")}
                disabled={year >= 2100}
                onClick={() => setYear(year + 1)}
              >
                {rtl ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
              </button>
            </header>
            <div className="month-picker-grid">
              {Array.from({ length: 12 }, (_, month) => {
                const key = `${year}-${String(month + 1).padStart(2, "0")}`;
                return (
                  <button
                    type="button"
                    key={key}
                    className={`date-picker-day ${value === "custom" && customMonth === key ? "selected" : ""}`}
                    aria-pressed={value === "custom" && customMonth === key}
                    onClick={() => {
                      onMonthChange(key);
                      onChange("custom");
                      setOpen(false);
                    }}
                  >
                    {new Date(year, month, 1).toLocaleDateString(tag, {
                      month: "short",
                    })}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
