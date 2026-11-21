import {
  Activity,
  Bell,
  BookOpen,
  CalendarClock,
  Home,
  LayoutDashboard,
  Leaf,
  Map as MapIcon,
  MessageSquare,
  Navigation,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { NavSection, UserPreferences } from '../types/airQuality.ts';

export interface NavItemConfig {
  id: NavSection;
  label: string;
  icon: typeof LayoutDashboard;
}

export const DEFAULT_PREFS: UserPreferences = {
  onboardingCompleted: false,
  priorities: ['Protect my family', 'Improve home air'],
  lifestyleRole: 'general',
  aqiStandard: 'us_aqi',
  tempUnit: 'C',
  demoMode: true,
  schedule: {
    wakeTime: '07:00',
    bedTime: '22:30',
    workStart: '08:30',
    workEnd: '17:30',
    commuteMode: 'public_transit',
    preferredExercise: 'walking',
    outdoorGoals: 'Reduce commute exposure and maintain indoor fitness',
  },
  household: [],
  budgetTier: '2000',
  accessibility: {
    highContrast: false,
    largeText: false,
    reducedMotion: false,
  },
  notifications: {
    aqiThreshold: 120,
    quietStart: '22:00',
    quietEnd: '06:30',
    enableInAppAlerts: true,
    dailySummary: true,
    indoorTips: true,
  },
};

export const CORE_NAV_ITEMS: NavItemConfig[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'map', label: 'Air Quality Map', icon: MapIcon },
  { id: 'planner', label: 'Daily Planner', icon: CalendarClock },
  { id: 'indoor', label: 'Home Air Care', icon: Home },
  { id: 'sustainability', label: 'Sustainable Living', icon: Leaf },
  { id: 'exposure', label: 'Exposure Tracker', icon: Activity },
  { id: 'assistant', label: 'AI Assistant', icon: MessageSquare },
];

export const SECONDARY_NAV_ITEMS: NavItemConfig[] = [
  { id: 'family', label: 'Protect My Family', icon: ShieldCheck },
  { id: 'commute', label: 'Commute Assistant', icon: Navigation },
  { id: 'community', label: 'Community Action', icon: Users },
  { id: 'education', label: 'Learning Center', icon: BookOpen },
  { id: 'notifications', label: 'Alerts', icon: Bell },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const MOBILE_QUICK_NAV: Array<{
  id: NavSection;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'planner', label: 'Planner', icon: CalendarClock },
  { id: 'indoor', label: 'Air Care', icon: Home },
  { id: 'exposure', label: 'Tracker', icon: Activity },
  { id: 'assistant', label: 'AI Chat', icon: MessageSquare },
];
