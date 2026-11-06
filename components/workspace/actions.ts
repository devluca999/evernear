"use client";
import { createContext, useContext } from "react";
import type { Gate } from "@/scenario/types";

export interface WorkspaceActions {
  openPhoto: (checkpointId: string, index: number) => void;
  openProof: (proofId: string) => void;
  /** The human moment the story waits for, if any, and how to answer it from a card. */
  waiting: Gate | null;
  answer: () => void;
}

export const ActionsContext = createContext<WorkspaceActions>({ openPhoto: () => {}, openProof: () => {}, waiting: null, answer: () => {} });
export const useActions = () => useContext(ActionsContext);
