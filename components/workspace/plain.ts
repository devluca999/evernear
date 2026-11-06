// One line in plain words for each proof, shown beside the raw call in the developer drawer.
export const PLAIN: Record<string, string> = {
  wallet_created: "Astro opened its own wallet on OutLayer. Evernear only ever gets a capped key, never Astro's money.",
  policy_set: "Astro set the rules: who can be paid, how much at once, and when two people must approve.",
  payment_receipt: "A routine reorder under the cap paid itself. No person had to step in.",
  inference_attestation: "The supplier offers were read inside an attested enclave, so the BOM stayed on private hardware.",
  approval_luca: "Luca signed PO 1042 on his own phone. Orders over $10,000 need two signatures.",
  approval_jordy: "Jordy added the second signature. Only now can money be committed.",
  refused_email: "The agent tried to email an address outside the allowlist. The connector blocked it, as designed.",
  connector_receipt: "The counter offer went to Haoyun through the Gmail connector, and only to Haoyun's address.",
  escrow_wallet: "$38,000 (shown at 1:1,000) moved into this PO's own account. From there it can only pay Haoyun or go back to Astro.",
  dock_attestation: "The dock count was checked by an attested program. Only its result can release money.",
  refused_release: "A payment to an address that is not Haoyun's was refused by the PO account itself. The guard works.",
  wallet_closed: "Nothing is left in PO 1042's wallet. It is frozen, Evernear's grant is revoked, and it stays as the order's receipt. It is never reused.",
  intents_payout: "Haoyun was paid for the 1,800 motors that arrived, on Base Sepolia. The $3,800 for the missing 200 goes back to Astro.",
};
