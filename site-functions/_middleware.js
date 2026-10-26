import { maybeCite } from "./cite.js";

export async function onRequest(context) {
  const cited = await maybeCite(context);
  if (cited) return cited;
  return context.next();
}
