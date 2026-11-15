type FormLike = { get(name: string): FormDataEntryValue | null };

export type SettingsFormValues = {
  whatsappNumber: string;
  messageTemplate: string;
  autoPublishNew: boolean;
  showPrices: boolean;
};

const text = (f: FormLike, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};
const checked = (f: FormLike, k: string) => f.get(k) === "on";

/** Raw form values; validation/normalization stays in the data layer (updateSettings). */
export function parseSettingsForm(f: FormLike): SettingsFormValues {
  return {
    whatsappNumber: text(f, "whatsappNumber"),
    messageTemplate: text(f, "messageTemplate"),
    autoPublishNew: checked(f, "autoPublishNew"),
    showPrices: checked(f, "showPrices"),
  };
}
