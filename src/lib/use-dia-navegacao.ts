import { useState } from "react";

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function shiftDay(d: string, delta: number): string {
  const dt = new Date(d + "T00:00:00");
  dt.setDate(dt.getDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function readDiaFromUrl(): string {
  if (typeof window === "undefined") return todayStr();
  const p = new URLSearchParams(window.location.search);
  return p.get("dia") || todayStr();
}

/** Navegação por dia sincronizada com ?dia= na URL — usado no Kanban e em Minhas tarefas. */
export function useDiaNavegacao() {
  const [dia, setDiaState] = useState<string>(readDiaFromUrl());

  function setDia(d: string) {
    setDiaState(d);
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      p.set("dia", d);
      window.history.replaceState({}, "", `${window.location.pathname}?${p.toString()}`);
    }
  }

  return { dia, setDia, isHoje: dia === todayStr() };
}
