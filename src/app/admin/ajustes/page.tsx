import type { Metadata } from "next";
import { SettingsForm } from "../../../components/admin/settings/SettingsForm";
import { withDb } from "../../../lib/admin/forms/with-db";
import { getSettings } from "../../../server/admin";
import { requireAdmin } from "../../../server/auth/session";
import { DEFAULT_MESSAGE_TEMPLATE } from "../../../server/catalog/read";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ajustes", robots: { index: false, follow: false } };

export default async function SettingsPage() {
  await requireAdmin();
  const s = await withDb((db) => getSettings(db));
  return (
    <main className="set-page">
      <h1>Ajustes</h1>
      <SettingsForm
        defaultTemplate={DEFAULT_MESSAGE_TEMPLATE}
        initial={{
          whatsappNumber: s.whatsappNumber ?? "",
          messageTemplate: s.messageTemplate ?? "",
          showPrices: s.showPrices,
        }}
      />
    </main>
  );
}
