// Simulated cast. Astro Robotics, its products, BOM and suppliers are fictional.
// Numbers follow docs/BUILD.md section 2 exactly.
import type { BomLine, Offer, Policy, Supplier } from "../engine/types";
import { cents } from "../engine/money";

export const astro = {
  id: "astro",
  name: "Astro Robotics Inc.",
  city: "Chicago",
  country: "USA",
  buyer: "Luca",
  secondApprover: "Jordy",
};

export const products = [
  { id: "10ma", name: "10MA", kind: "Helper robot", playable: true },
  { id: "kip", name: "Kip", kind: "Floor cleaning robot", playable: false },
  { id: "porter", name: "Porter", kind: "Factory delivery cart", playable: false },
] as const;

const line = (n: number, part: string, qty: number, specs: Record<string, string>): BomLine => ({
  id: `10ma-${String(n).padStart(2, "0")}`, product: "10ma", part, qty, specs,
});

export const MOTOR_PART = "Actuator motor";

export const bom10MA: BomLine[] = [
  line(1, MOTOR_PART, 4, { shaftDiameter: "6 mm", mountingFlange: "NEMA 17", voltage: "48 V", encoderConnector: "Molex" }),
  line(2, "Chassis frame", 1, { material: "6061 aluminium", height: "1,180 mm" }),
  line(3, "Arm servo", 2, { torque: "25 kg cm", voltage: "12 V" }),
  line(4, "Battery pack", 1, { voltage: "48 V", capacity: "20 Ah" }),
  line(5, "Controller board", 1, { mcu: "ARM Cortex-M7", bus: "CAN FD" }),
  line(6, "Camera module", 2, { resolution: "1080p", interface: "MIPI CSI-2" }),
  line(7, "Encoder harness", 4, { connector: "Molex", length: "300 mm" }),
  line(8, "Drive wheel", 2, { diameter: "150 mm", tread: "polyurethane" }),
  line(9, "Lidar sensor", 1, { range: "12 m", interface: "UART" }),
  line(10, "Head shell", 1, { material: "ABS", finish: "matte" }),
  line(11, "Speaker", 1, { power: "5 W", impedance: "4 ohm" }),
  line(12, "Microphone array", 1, { channels: "4", interface: "I2S" }),
  line(13, "Wiring loom", 1, { gauge: "18 AWG", length: "2 m" }),
  line(14, "Fastener kit", 1, { standard: "ISO metric", grade: "A2 stainless" }),
];

export const suppliers: Supplier[] = [
  { id: "ultra", name: "Ultra Motion", city: "Illinois", country: "USA", approved: true, isNew: false, receiveChain: "near", receiveAddress: "ultra-motion.testnet" },
  { id: "haoyun", name: "Haoyun Precision", city: "Shenzhen", country: "China", approved: true, isNew: true, receiveChain: "base", receiveAddress: "0x2003975a521c6fa45238dbc402c9e4adcb8863e0" },
  { id: "kansai", name: "Kansai Servo Works", city: "Osaka", country: "Japan", approved: true, isNew: true, receiveChain: "near", receiveAddress: "kansai-servo.testnet" },
  { id: "rheinwerk", name: "Rheinwerk Antriebstechnik", city: "Stuttgart", country: "Germany", approved: false, isNew: true, receiveChain: "near", receiveAddress: "rheinwerk.testnet" },
  { id: "huaxin", name: "Huaxin Robotics Components", city: "Dongguan", country: "China", approved: true, isNew: true, receiveChain: "near", receiveAddress: "huaxin-robotics.testnet" },
];

export const policy: Policy = {
  autoApproveUnderCents: cents(10_000),
  approversRequired: 2,
  priceChangeLimitBps: 300,
  priceCaps: { [MOTOR_PART]: 1910 },
};

const motor = MOTOR_PART;
const fits = bom10MA[0].specs;
const specsOf = (part: string) => bom10MA.find((l) => l.part === part)!.specs;

// Huaxin quotes 11 of the 14 lines and fails 3: motor flange, encoder harness connector, battery voltage.
const huaxinParts = [
  "Actuator motor", "Chassis frame", "Arm servo", "Battery pack", "Controller board", "Camera module",
  "Encoder harness", "Drive wheel", "Head shell", "Wiring loom", "Fastener kit",
];
const huaxinOverrides: Record<string, Record<string, string>> = {
  "Actuator motor": { mountingFlange: "NEMA 23" },
  "Encoder harness": { connector: "JST-GH" },
  "Battery pack": { voltage: "36 V" },
};
const huaxinPrice: Record<string, number> = { "Actuator motor": 1590 };

export const offers: Offer[] = [
  { supplierId: "ultra", part: motor, unitCents: 1854, specs: { ...fits } },
  { supplierId: "haoyun", part: motor, unitCents: 1854, specs: { ...fits } },
  { supplierId: "kansai", part: motor, unitCents: 1720, specs: { ...fits, shaftDiameter: "8 mm" } },
  // 2.4x the cap: 1910 x 2.4 = 4584
  { supplierId: "rheinwerk", part: motor, unitCents: 4584, specs: { ...fits } },
  ...huaxinParts.map((part) => ({
    supplierId: "huaxin",
    part,
    unitCents: huaxinPrice[part] ?? 1000,
    specs: { ...specsOf(part), ...(huaxinOverrides[part] ?? {}) },
  })),
];

export const PO = {
  number: "1042",
  quantity: 2000,
  originalUnitCents: 1854,
  confirmedUnitCents: 2002,
  revisedUnitCents: 1900,
  revisedTotalCents: 2000 * 1900,
  receivedQty: 1800,
};

export const routineReorder = { supplierId: "ultra", quantity: 300, unitCents: 1854 };

export const demand = {
  robotsOrdered: 14,
  motorsPerRobot: 4,
  motorsOnHand: 24,
  customers: ["Lakeview Restaurant Group", "St. Brigid Hospital", "Calumet Logistics warehouse"],
};
