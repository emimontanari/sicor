type Props = {
  src: string | undefined;
  alt: string;
  priority?: boolean;
  sizes?: string;
};

/** Plain <img> (the /images route serves originals; no optimizer round trip). Fixed box prevents layout shift. */
export function ProductImage({ src, alt, priority = false }: Props) {
  if (!src) {
    return (
      <div className="img-box img-box--empty" role="img" aria-label={`${alt} (sin imagen)`}>
        <span aria-hidden>SICOR</span>
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
