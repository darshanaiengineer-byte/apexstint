import { notFound } from "next/navigation";
import { LOCAL_RACE_IDS, raceRepository } from "@/lib/data/repository";

/** Shared loader for /races/[id] routes: 404 on unknown ids, structured error on invalid data. */
export async function loadRace(id: string) {
  const res = await raceRepository.getRace(id);
  if (!res.ok && res.reason === "not-found") notFound();
  return res;
}

export function raceStaticParams() {
  return LOCAL_RACE_IDS.map((id) => ({ id }));
}
