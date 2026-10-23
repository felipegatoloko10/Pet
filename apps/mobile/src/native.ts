import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
export type Reminder = {
  taskId?: string;
  phase?: string;
  snoozePhase?: string;
  scheduleKey?: string;
  taskRevision?: number;
  expiresAt?: number;
  body?: string;
  noticeId: string;
  eventId: string;
  title: string;
  dueAt: number;
  startAt: number;
};
export type NoticeTarget = {
  eventId?: string;
  noticeId?: string;
  taskId?: string;
};
export interface NativeBridge {
  flushOperations(v: { userId: string }): Promise<{ snapshot: string | null }>;
  discardOperations(v: { userId: string }): Promise<void>;
  readSecure(v: { key: string }): Promise<{ value: string | null }>;
  writeSecure(v: { key: string; value: string | null }): Promise<void>;
  bindAccount(v: { userId: string }): Promise<void>;
  readCache(v: {
    userId: string;
    key: string;
  }): Promise<{ value: string | null }>;
  writeCache(v: { userId: string; key: string; value: string }): Promise<void>;
  clearCache(v: { userId: string }): Promise<void>;
  syncReminders(v: {
    userId: string;
    timezone: string;
    quietStart: string;
    quietEnd: string;
    reminders: Reminder[];
  }): Promise<void>;
  enableNotifications(): Promise<{ token: string }>;
  getPushToken(): Promise<{ token: string | null }>;
  settings(): Promise<void>;
  getPrivacy(): Promise<{ hidden: boolean }>;
  setPrivacy(v: { hidden: boolean }): Promise<void>;
  logout(): Promise<void>;
  speak(v: { text: string }): Promise<void>;
  stopSpeech(): Promise<void>;
  consumeNotice(): Promise<NoticeTarget>;
  addListener(
    event: "noticeOpen",
    listener: (value: NoticeTarget) => void,
  ): Promise<PluginListenerHandle>;
}
export const native = Capacitor.isNativePlatform();
export const Native = registerPlugin<NativeBridge>("PingoNative");
