/** CSS-only radio chips (no client JS); T4 reads the checked inputs by name. */
export function VariantChips({
  name,
  label,
  options,
}: {
  name: "talle" | "color";
  label: string;
  options: string[];
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="chips">
      <legend>{label}</legend>
      <div className="chips__row">
        {options.map((o, i) => (
          <label key={o} className="chip">
            <input type="radio" name={name} value={o} defaultChecked={options.length === 1 && i === 0} />
            <span>{o}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
