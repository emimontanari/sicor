type FormLike = { get(name: string): FormDataEntryValue | null };

export type SettingsFormValues = {
  whatsappNumber: string;
  messageTemplate: string;
  showPrices: boolean;
};

const text = (f: FormLike, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};
const checked = (f: FormLike, k: string) => f.get(k) === "on";

/** Raw form values; validation/normalization stays in the data layer (updateSettings).
 *  publish-on-sync S5: auto_publish_new is gone from the form (everything publishes; the DB column stays). */
export function parseSettingsForm(f: FormLike): SettingsFormValues {
  return {
    whatsappNumber: text(f, "whatsappNumber"),
    messageTemplate: text(f, "messageTemplate"),
    showPrices: checked(f, "showPrices"),
  };
}
