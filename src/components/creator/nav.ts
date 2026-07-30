import {
  LayoutGrid,
  Megaphone,
  BarChart3,
  FileVideo,
  Users,
  Wallet,
  Banknote,
  BookOpen,
  Trophy,
  Bell,
  User,
  Settings,
  LifeBuoy,
  LucideIcon
} from 'lucide-react';

export type CreatorSection =
  | 'dashboard'
  | 'campaigns'
  | 'analytics'
  | 'content'
  | 'referrals'
  | 'earnings'
  | 'payments'
  | 'resources'
  | 'achievements'
  | 'notifications'
  | 'profile'
  | 'settings'
  | 'support';

export interface CreatorNavItem {
  id: CreatorSection;
  label: string;
  icon: LucideIcon;
  /** "live" sections read real data from the Creator API. "soon" sections are honest placeholders — no backend yet. */
  status: 'live' | 'soon';
}

export const CREATOR_NAV_ITEMS: CreatorNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid, status: 'live' },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone, status: 'live' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, status: 'live' },
  { id: 'content', label: 'Content', icon: FileVideo, status: 'live' },
  { id: 'referrals', label: 'Referrals', icon: Users, status: 'live' },
  { id: 'earnings', label: 'Earnings', icon: Wallet, status: 'live' },
  { id: 'payments', label: 'Payments', icon: Banknote, status: 'live' },
  { id: 'resources', label: 'Resources', icon: BookOpen, status: 'live' },
  { id: 'achievements', label: 'Achievements', icon: Trophy, status: 'live' },
  { id: 'notifications', label: 'Notifications', icon: Bell, status: 'soon' },
  { id: 'profile', label: 'Profile', icon: User, status: 'live' },
  { id: 'settings', label: 'Settings', icon: Settings, status: 'soon' },
  { id: 'support', label: 'Support', icon: LifeBuoy, status: 'live' }
];

export const MOBILE_PRIMARY_SECTIONS: CreatorSection[] = ['dashboard', 'campaigns', 'earnings', 'referrals'];
