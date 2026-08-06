import type * as React from "react";
import { useTranslation } from "react-i18next";
import { ChevronRightIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import type { NavItem, Tab } from "../App";

/**
 * Үндсэн цэс (sidebar-07 хэв маяг): бүлэг = задардаг (Collapsible) зүйл,
 * дан таб = энгийн товч. Icon горимд хумихад дэд табууд нуугдаж,
 * бүлгийн дүрс tooltip-той үлдэнэ.
 */
export function NavMain({
  nav,
  icons,
  activeTab,
  onSelect,
}: {
  nav: NavItem[];
  icons: Partial<Record<string, React.ComponentType<{ className?: string }>>>;
  activeTab: Tab;
  onSelect: (id: Tab, group?: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <SidebarGroup>
      <SidebarMenu>
        {nav.map((n) => {
          if ("children" in n) {
            const Icon = icons[n.group];
            const hasActive = n.children.some((c) => c.id === activeTab);
            return (
              <Collapsible
                key={n.group}
                asChild
                defaultOpen={hasActive}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip={t(n.label)} isActive={hasActive}>
                      {Icon && <Icon />}
                      <span>{t(n.label)}</span>
                      <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {n.children.map((c) => (
                        <SidebarMenuSubItem key={c.id}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={activeTab === c.id}
                          >
                            <button
                              type="button"
                              className="w-full"
                              onClick={() => onSelect(c.id, n.group)}
                            >
                              <span>{t(c.label)}</span>
                            </button>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            );
          }
          const Icon = icons[n.id];
          return (
            <SidebarMenuItem key={n.id}>
              <SidebarMenuButton
                tooltip={t(n.label)}
                isActive={activeTab === n.id}
                onClick={() => onSelect(n.id)}
              >
                {Icon && <Icon />}
                <span>{t(n.label)}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
