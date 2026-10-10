import { createContext, useContext } from "react";
import type { Operation } from "./types";

interface OpCtxValue {
  operation: Operation;
  /** Back to the operation list. */
  switchOperation: () => void;
}

export const OpCtx = createContext<OpCtxValue | null>(null);
export const useOperation = () => useContext(OpCtx)!;
