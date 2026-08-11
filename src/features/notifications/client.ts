import "server-only";

export type NotificationSender = { send: (payload: unknown) => Promise<void> };

const logEnabled = process.env.NOTIFICATION_LOG_ENABLED === "1";

export const logNotificationSender: NotificationSender = {
  async send(payload) {
    if (logEnabled) console.log(`[notify:${new Date().toISOString()}]`, JSON.stringify(payload));
  },
};

export function getNotificationSender(): NotificationSender {
  return logNotificationSender;
}