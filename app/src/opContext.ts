import { createContext, useContext } from "react";
import type { Operation } from "./types";

interface OpCtxValue {
  operation: Operation;
  /** Back to the operation list. */
  switchOperation: () => void;
  /** Saves the operation's situation write-up; an empty body clears it. Rejects on failure. */
  saveSituation: (author: string, body: string) => Promise<void>;
}

export const OpCtx = createContext<OpCtxValue | null>(null);
export const useOperation = () => useContext(OpCtx)!;
