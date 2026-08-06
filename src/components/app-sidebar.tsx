import type * as React from "react";
import {
  ArrowLeftRightIcon,
  ChartBarIcon,
  ClipboardListIcon,
  PackageIcon,
  RadioIcon,
  Settings2Icon,
  ShieldIcon,
  TagsIcon,
  WarehouseIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import type { NavItem, Tab } from "../App";

// Дан таб + бүлгийн дүрсүүд (sidebar-07: дэд табууд дүрсгүй, зөвхөн текст).
// Шинэ таб/бүлэг нэмэхэд энд дүрс нь нэмэгдэнэ (байхгүй бол дүрсгүй гарна).
const NAV_ICON: Partial<Record<string, React.ComponentType<{ className?: string }>>> = {
  epc: TagsIcon,
  products: PackageIcon,
  inventory: WarehouseIcon,
  stocktake: ClipboardListIcon,
  transactions: ArrowLeftRightIcon,
  reports: ChartBarIcon,
  admin: Settings2Icon,
  platform: ShieldIcon,
};

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
  const { isMobile, setOpenMobile } = useSidebar();

  // Мобайл дээр сонгосны дараа хажуугийн цэс (Sheet) хаагдана.
  const select = (id: Tab, group?: string) => {
    onSelectTab(id, group);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="cursor-default">
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <RadioIcon className="size-4" />
              </div>
              <span className="truncate text-base font-semibold">
                Chipmo Inventory
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain nav={nav} icons={NAV_ICON} activeTab={activeTab} onSelect={select} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser email={email} onSignOut={onSignOut} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
