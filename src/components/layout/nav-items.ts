import {
  LayoutDashboard,
  Package,
  History,
  AlertTriangle,
  XCircle,
  Truck,
  Warehouse,
  BarChart3,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { PERMISSIONS } from '@/lib/permissions';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
  { href: '/products', label: 'Products', icon: Package, permission: PERMISSIONS.PRODUCT_VIEW },
  { href: '/inventory/history', label: 'Stock history', icon: History, permission: PERMISSIONS.INVENTORY_HISTORY_VIEW },
  { href: '/inventory/low-stock', label: 'Low stock', icon: AlertTriangle, permission: PERMISSIONS.INVENTORY_VIEW },
  { href: '/inventory/out-of-stock', label: 'Out of stock', icon: XCircle, permission: PERMISSIONS.INVENTORY_VIEW },
  { href: '/suppliers', label: 'Suppliers', icon: Truck, permission: PERMISSIONS.SUPPLIER_VIEW },
  { href: '/locations', label: 'Locations', icon: Warehouse, permission: PERMISSIONS.LOCATION_VIEW },
  { href: '/reports', label: 'Reports', icon: BarChart3, permission: PERMISSIONS.REPORT_VIEW },
  { href: '/users', label: 'Users', icon: Users, permission: PERMISSIONS.USER_VIEW },
];

/** Compact set for the mobile bottom bar — the five most-used destinations. */
export const MOBILE_NAV_ITEMS: NavItem[] = [
  NAV_ITEMS[0]!,
  NAV_ITEMS[1]!,
  NAV_ITEMS[3]!,
  NAV_ITEMS[4]!,
  NAV_ITEMS[2]!,
];
