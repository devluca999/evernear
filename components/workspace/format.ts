const SPEC_LABEL: Record<string, string> = {
  shaftDiameter: "Shaft",
  mountingFlange: "Flange",
  voltage: "Voltage",
  encoderConnector: "Connector",
  connector: "Connector",
};

export const specLabel = (spec: string) => SPEC_LABEL[spec] ?? spec;

/** "Shaft 8 mm, needs 6 mm" */
export const mismatchText = (m: { spec: string; offered: string; required: string; line?: string }) => {
  const label = m.line === "Battery pack" && m.spec === "voltage" ? "Battery" : specLabel(m.spec);
  return `${label} ${m.offered}, needs ${m.required}`;
};

/** 300 -> "3%", 250 -> "2.5%", 798 -> "8%" (one decimal at most, trailing zero dropped). */
export const pct = (bps: number) => `${+(bps / 100).toFixed(1)}%`;
