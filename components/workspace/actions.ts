"use client";
import { createContext, useContext } from "react";

export interface WorkspaceActions {
  openPhoto: (checkpointId: string, index: number) => void;
  openProof: (proofId: string) => void;
}

export const ActionsContext = createContext<WorkspaceActions>({ openPhoto: () => {}, openProof: () => {} });
export const useActions = () => useContext(ActionsContext);
