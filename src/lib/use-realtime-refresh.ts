import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";

/**
 * Assina mudanças em tabelas operacionais e dispara `onChange` (com debounce)
 * para que a tela recarregue automaticamente quando outro usuário alterar dados.
 */
export function useRealtimeRefresh(
  tables: string[],
  onChange: () => void,
  options?: { debounceMs?: number; channelName?: string }
) {
  const cbRef = useRef(onChange);
  cbRef.current = onChange;
  const debounceMs = options?.debounceMs ?? 400;

  useEffect(() => {
    if (typeof window === "undefined" || tables.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => cbRef.current(), debounceMs);
    };

    const chName = options?.channelName ?? `rt-${tables.join("-")}-${Math.random().toString(36).slice(2, 7)}`;
    let channel = supabase.channel(chName);
    for (const t of tables) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table: t }, trigger);
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join("|"), debounceMs]);
}
