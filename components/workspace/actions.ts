"use client";
import { createContext, useContext } from "react";
import type { Gate } from "@/scenario/types";

export interface WorkspaceActions {
  openPhoto: (checkpointId: string, index: number) => void;
  openProof: (proofId: string) => void;
  /** The human moment the story waits for, if any, and how to answer it from a card. */
  waiting: Gate | null;
  answer: () => void;
  /** Live on Tidepool testnet: whether the key answered, and the money step running right now. */
  live?: LiveView;
}

export interface LiveView {
  on: boolean;
  /** null while the first check is still out. */
  connected: boolean | null;
  /** Where the treasury stands, from the first check. */
  note: string | null;
  /** The money step under way, said plainly ("Committing $63.00 on Tidepool testnet"). */
  running: string | null;
}

export const ActionsContext = createContext<WorkspaceActions>({ openPhoto: () => {}, openProof: () => {}, waiting: null, answer: () => {} });
export const useActions = () => useContext(ActionsContext);
