/** Read and write the ?year=&place= URL. The page does not use a router library. */

export function readQuery(search = window.location.search) {
  const params = new URLSearchParams(search);
  return {
    year: params.get("year") || "",
    place: params.get("place") || "",
  };
}

export function writeQuery(query) {
  const params = new URLSearchParams();
  if (query.year !== undefined && query.year !== null && String(query.year) !== "") {
    params.set("year", String(query.year));
  }
  if (query.place) params.set("place", query.place);
  const qs = params.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
  const current = `${window.location.pathname}${window.location.search}`;
  if (next === current) return;
  window.history.replaceState(
    { year: query.year ? String(query.year) : "", place: query.place || "" },
    "",
    next,
  );
}

export function onPopState(handler) {
  window.addEventListener("popstate", () => handler(readQuery()));
}
