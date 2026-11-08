import * as Tabs from "@radix-ui/react-tabs";
import { Link } from "react-router-dom";
import { useApp } from "@/stores/appStore";
import { Button, PageHeader } from "@/components/ui/primitives";
import { NotificationList } from "@/components/notifications/NotificationList";
import { maskContact } from "@/services/notificationService";
import { fmtDateTime } from "@/utils/format";

export default function NotificationsPage() {
  const alerts = useApp((s) => s.alerts);
  const deliveries = useApp((s) => s.deliveries);
  const subs = useApp((s) => s.subscriptions);
  const markRead = useApp((s) => s.markAlertsRead);
  const clearDeliveries = useApp((s) => s.clearDeliveries);
  const set = useApp((s) => s.set);
  const unread = alerts.filter((a) => !a.read).length;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Notifications"
        description="In-app alerts and the log of email and SMS messages that would be sent."
        actions={
          <Button variant="primary" onClick={() => set("subscribeFor", "area")}>
            Subscribe to alerts
          </Button>
        }
      />
      <Tabs.Root defaultValue="alerts" className="flex min-h-0 flex-1 flex-col">
        <Tabs.List className="flex gap-4 border-b border-line px-6" aria-label="Notification views">
          {[
            ["alerts", "In-app alerts", alerts.length],
            ["log", "Delivery log", deliveries.length],
          ].map(([v, l, n]) => (
            <Tabs.Trigger key={v} value={v as string} className="-mb-px flex h-10 items-center gap-2 border-b-2 border-transparent text-sm text-text-2 data-[state=active]:border-accent data-[state=active]:text-text-1">
              {l}
              <span className="num rounded bg-surface-3 px-1 text-2xs">{n}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="alerts" className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-2 text-xs text-text-3">
            <span>{unread} unread</span>
            <Button size="sm" variant="ghost" onClick={() => markRead()} disabled={!unread}>
              Mark all as read
            </Button>
          </div>
          <div className="mx-6 mb-6 rounded-lg border border-line bg-surface-1">
            <NotificationList />
          </div>
        </Tabs.Content>
        <Tabs.Content value="log" className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-6 my-4 rounded border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
            Simulated — not sent. These rows show what the backend would deliver through Resend (email) and Twilio (SMS) once connected.
          </div>
          {deliveries.length === 0 ? (
            <p className="px-6 py-4 text-sm text-text-2">
              {subs.length === 0 ? (
                <>
                  No subscriptions yet. Subscribe to a hydrant or neighborhood, then trigger an event from Demo controls.
                </>
              ) : (
                <>Nothing delivered yet. Trigger an event that matches one of your {subs.length} subscriptions.</>
              )}
            </p>
          ) : (
            <div className="mx-6 mb-6 overflow-x-auto rounded-lg border border-line bg-surface-1">
              <table className="w-full min-w-[640px] text-xs">
                <thead className="text-left text-text-3">
                  <tr className="border-b border-line">
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Channel</th>
                    <th className="px-3 py-2 font-medium">Provider</th>
                    <th className="px-3 py-2 font-medium">Recipient</th>
                    <th className="px-3 py-2 font-medium">Subject</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {deliveries.map((d) => (
                    <tr key={d.id} className="h-8">
                      <td className="num px-3 py-2 text-text-2">{fmtDateTime(d.createdAt)}</td>
                      <td className="px-3 py-2">{d.channel === "email" ? "Email" : "SMS"}</td>
                      <td className="px-3 py-2 text-text-2">{d.provider === "resend" ? "Resend" : "Twilio"}</td>
                      <td className="num px-3 py-2">{maskContact(d.to)}</td>
                      <td className="px-3 py-2">{d.subject}</td>
                      <td className="px-3 py-2 text-warn">Simulated — not sent</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center gap-4 px-6 pb-6 text-xs">
            <Link to="/settings#subscriptions" className="text-accent hover:underline">
              Manage subscriptions ({subs.length})
            </Link>
            {deliveries.length > 0 && (
              <Button size="sm" variant="ghost" onClick={clearDeliveries}>
                Clear delivery log
              </Button>
            )}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
