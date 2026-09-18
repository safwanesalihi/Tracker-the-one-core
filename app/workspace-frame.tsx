"use client";

import {
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import { Printer, Settings2 } from "lucide-react";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import WorkspaceSwitch from "@/app/workspace-switch";
import SettingsDialog, { type ProfileUser } from "@/app/settings-dialog";
import Avatar from "@/app/profile-avatar";
import { useI18n } from "@/app/locale-provider";
import {
  isPrintWorkspaceId,
  roleLabels,
  type WorkspaceContext,
  type WorkspaceSummary,
} from "@/lib/workspace";

export type WorkspaceFrameOptions = {
  workspace: WorkspaceContext | null;
  workspaces: WorkspaceSummary[];
  user: ProfileUser;
  busy: boolean;
  sidebarWidth: number;
  onResizeStart: (event: MouseEvent) => void;
  onWidthChange: (width: number) => void;
  onSwitch: (id: string) => void;
  onCreatePrint?: () => Promise<void>;
  onProfile: (changes: {
    name?: string;
    avatar?: string | null;
  }) => Promise<ProfileUser | undefined>;
  onLogout: () => void;
};

export default function WorkspaceFrame({
  navigation,
  children,
  ...options
}: WorkspaceFrameOptions & { navigation: ReactNode; children: ReactNode }) {
  const { t, rtl } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { workspace, workspaces, user, busy, sidebarWidth } = options;
  const printing = !!workspace && isPrintWorkspaceId(workspace.id);
  return (
    <SidebarProvider
      className={printing ? "workspace-frame print-app" : "workspace-frame"}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <Sidebar className="tracker-sidebar" side={rtl ? "right" : "left"}>
        <SidebarHeader>
          <div className={`brand ${printing ? "workspace-brand-print" : ""}`}>
            <Image
              className="sidebar-logo"
              src={
                printing ? "/the-one-print-logo.svg" : "/the-one-core-logo.svg"
              }
              alt={
                printing ? "The One Print — By The One Core" : "The One Core"
              }
              width={588}
              height={138}
              priority
            />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <Navigation>{navigation}</Navigation>
        </SidebarContent>
        <SidebarFooter>
          {workspaces.length > 1 ? (
            <WorkspaceSwitch
              value={workspace?.id || ""}
              workspaces={workspaces}
              disabled={busy}
              onChange={options.onSwitch}
            />
          ) : options.onCreatePrint &&
            workspace?.role === "owner" &&
            !workspaces.some((w) => isPrintWorkspaceId(w.id)) ? (
            <button
              type="button"
              className="btn subtle workspace-create-print"
              disabled={busy}
              onClick={() => void options.onCreatePrint?.()}
            >
              <Printer size={14} />
              {t("Créer l’espace Impression")}
            </button>
          ) : null}
          <div className="user-row">
            <button
              className="user-profile"
              onClick={() => setSettingsOpen(true)}
              aria-label={t("Paramètres")}
              title={t("Paramètres")}
            >
              <Avatar name={user.name} avatar={user.avatar} />
              <div>
                <strong>
                  {user.name.includes("@")
                    ? user.name.split("@")[0]
                    : user.name}
                </strong>
                <small>
                  {workspace
                    ? `${t(roleLabels[workspace.role])} · ${workspace.name}`
                    : t("Mode démonstration")}
                </small>
              </div>
              <Settings2 size={15} className="user-settings-icon" />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <ResizeHandle
        width={sidebarWidth}
        onResizeStart={options.onResizeStart}
        onWidthChange={options.onWidthChange}
      />
      {children}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        user={user}
        workspaceId={workspace?.id || null}
        workspaceName={workspace?.name}
        onSave={options.onProfile}
        onLogout={() => {
          setSettingsOpen(false);
          options.onLogout();
        }}
      />
    </SidebarProvider>
  );
}

function Navigation({ children }: { children: ReactNode }) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <div
      className="workspace-navigation"
      onClick={(event) => {
        if (
          isMobile &&
          event.target instanceof Element &&
          event.target.closest("button")
        )
          setOpenMobile(false);
      }}
    >
      {children}
    </div>
  );
}

function ResizeHandle({
  width,
  onResizeStart,
  onWidthChange,
}: {
  width: number;
  onResizeStart: (event: MouseEvent) => void;
  onWidthChange: (width: number) => void;
}) {
  const { t, rtl } = useI18n();
  const { isMobile, open } = useSidebar();
  if (isMobile || !open) return null;
  return (
    <div
      className="sidebar-resize-handle"
      style={rtl ? { right: width } : { left: width }}
      onMouseDown={onResizeStart}
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={t("Redimensionner la barre latérale")}
      aria-valuemin={190}
      aria-valuemax={420}
      aria-valuenow={width}
      onKeyDown={(event) => {
        const direction =
          event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!direction && !["Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next =
          event.key === "Home"
            ? 190
            : event.key === "End"
              ? 420
              : Math.max(
                  190,
                  Math.min(420, width + direction * (rtl ? -10 : 10)),
                );
        onWidthChange(next);
        try {
          localStorage.setItem("the-one.sidebarWidth", String(next));
        } catch {
          /* private mode */
        }
      }}
    />
  );
}
