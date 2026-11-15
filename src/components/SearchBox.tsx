export function SearchBox({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <form action="/buscar" method="get" role="search" className="search">
      <label htmlFor="q" className="sr-only">
        Buscar productos
      </label>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Buscar productos"
        autoComplete="off"
        enterKeyHint="search"
      />
      <button type="submit">Buscar</button>
    </form>
  );
}
