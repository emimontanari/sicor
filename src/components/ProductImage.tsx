import { Icon, type IconName } from "./Icon";

type Props = {
  src: string | null | undefined;
  alt: string;
  /** Shown on the no-photo placeholder ("Sin foto" + code). */
  code?: string;
  icon?: IconName;
  priority?: boolean;
};

/**
 * Plain <img> (the /images route serves originals; no optimizer round trip).
 * Fixed width/height attributes plus a CSS aspect-ratio box prevent layout shift; below-the-fold
 * images lazy-load.
 */
export function ProductImage({ src, alt, code, icon = "box", priority = false }: Props) {
  if (!src) {
    return (
      <div className="img-box img-box--empty" role="img" aria-label={`${alt} (sin foto)`}>
        <Icon name={icon} className="img-box__pic" />
        <span className="img-box__lbl" aria-hidden>
          Sin foto
        </span>
        {code ? (
          <span className="img-box__code" aria-hidden>
            {code}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <div className="img-box">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={600}
        height={600}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
      />
    </div>
  );
}
