import type * as React from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftRightIcon,
  Building2Icon,
  ChartBarIcon,
  CirclePlusIcon,
  ClipboardListIcon,
  InboxIcon,
  ListIcon,
  PackageIcon,
  RadioIcon,
  ScrollTextIcon,
  SearchIcon,
  Settings2Icon,
  ShieldIcon,
  TagsIcon,
  UsersIcon,
  WarehouseIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavUser } from "@/components/nav-user";
import type { NavItem, Tab, TabDef } from "../App";

// Таб бүрийн дүрс — шинэ таб нэмэхэд энд дүрс нь нэмэгдэнэ (байхгүй бол дүрсгүй гарна).
const TAB_ICON: Partial<Record<Tab, React.ComponentType<{ className?: string }>>> = {
  table: ListIcon,
  create: CirclePlusIcon,
  receiving: InboxIcon,
  labels: TagsIcon,
  lookup: SearchIcon,
  products: PackageIcon,
  inventory: WarehouseIcon,
  stocktake: ClipboardListIcon,
  transactions: ArrowLeftRightIcon,
  reports: ChartBarIcon,
  branches: Building2Icon,
  org: Settings2Icon,
  audit: ScrollTextIcon,
  members: UsersIcon,
  platform: ShieldIcon,
};

// Хажуугийн цэсний хэсэг: бүлэг = шошготой, дараалсан дан табууд = шошгогүй нэг хэсэг.
type Section = { key: string; label?: string; items: { def: TabDef; group?: string }[] };

function toSections(nav: NavItem[]): Section[] {
  const sections: Section[] = [];
  for (const n of nav) {
    if ("children" in n) {
      sections.push({
        key: n.group,
        label: n.label,
        items: n.children.map((def) => ({ def, group: n.group })),
      });
    } else {
      const last = sections[sections.length - 1];
      if (last && !last.label) last.items.push({ def: n });
      else sections.push({ key: `tabs-${n.id}`, items: [{ def: n }] });
    }
  }
  return sections;
}

export function AppSidebar({
  nav,
  activeTab,
  onSelectTab,
  email,
  onSignOut,
  ...props
}: {
  nav: NavItem[];
  activeTab: Tab;
  onSelectTab: (id: Tab, group?: string) => void;
  email: string;
  onSignOut: () => void;
} & React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation();
  const { isMobile, setOpenMobile } = useSidebar();

  // Мобайл дээр сонгосны дараа хажуугийн цэс (Sheet) хаагдана.
  const select = (id: Tab, group?: string) => {
    onSelectTab(id, group);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="data-[slot=sidebar-menu-button]:p-1.5!">
              <RadioIcon className="size-5!" />
              <span className="text-base font-semibold">Chipmo Inventory</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {toSections(nav).map((s) => (
          <SidebarGroup key={s.key}>
            {s.label && <SidebarGroupLabel>{t(s.label)}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {s.items.map(({ def, group }) => {
                  const Icon = TAB_ICON[def.id];
                  return (
                    <SidebarMenuItem key={def.id}>
                      <SidebarMenuButton
                        isActive={activeTab === def.id}
                        onClick={() => select(def.id, group)}
                        tooltip={t(def.label)}
                      >
                        {Icon && <Icon />}
                        <span>{t(def.label)}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser email={email} onSignOut={onSignOut} />
      </SidebarFooter>
    </Sidebar>
  );
}
